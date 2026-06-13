const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_TIMEOUT_MS = 120000;

function chunk(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function stripJsonFence(content) {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseTranslationArray(content) {
  const cleaned = stripJsonFence(content);
  const parsed = JSON.parse(cleaned);

  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.translations)) return parsed.translations;

  throw new Error('Online translation response must be a JSON array or { translations: string[] }.');
}

function requireOption(value, name) {
  if (typeof value === 'string' && value.trim()) return value;
  throw new Error(`[literal-i18n] Missing required translate option: ${name}.`);
}

function normalizePositiveInteger(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) return fallback;
  return Math.floor(numericValue);
}

function createTranslationPrompt({ sourceLocale, targetLocale, prompt }) {
  return [
    prompt || 'You are a professional website UI localization translator. Keep translations concise and natural.',
    `Translate from ${sourceLocale} to ${targetLocale}.`,
    'Preserve placeholders exactly, including braces, such as {name}, {count}, {xxx}.',
    'Do not add explanations, markdown, numbering, or extra keys.',
    'Return only a JSON array of strings. The output array length and order must exactly match the input array.',
  ].join('\n');
}

async function postOpenAICompatibleChat({
  baseUrl,
  apiKey,
  model,
  texts,
  sourceLocale,
  targetLocale,
  prompt,
  temperature,
  thinking,
  timeoutMs,
}) {
  if (!apiKey) {
    throw new Error('Missing online translation API key.');
  }

  const payload = await postJson(
    `${baseUrl.replace(/\/$/, '')}/chat/completions`,
    {
      model,
      temperature,
      ...(thinking ? { thinking } : {}),
      messages: [
        {
          role: 'system',
          content: createTranslationPrompt({
            sourceLocale,
            targetLocale,
            prompt,
          }),
        },
        {
          role: 'user',
          content: JSON.stringify(texts),
        },
      ],
    },
    timeoutMs,
    {
      Authorization: `Bearer ${apiKey}`,
    },
  );

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Online translation response did not contain message content.');
  }

  return parseTranslationArray(content);
}

async function postJson(url, body, timeoutMs, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error?.message || payload.error || `Translate API error ${response.status}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

function createOpenAICompatibleTranslateJsonHook(options = {}) {
  const baseUrl = requireOption(options.baseUrl, 'baseUrl');
  const apiKey = requireOption(options.apiKey, 'apiKey');
  const model = requireOption(options.model, 'model');
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE);
  const timeoutMs = normalizePositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const temperature = options.temperature ?? 0.1;
  const thinking = options.thinking;
  const prompt = options.prompt;
  const failOnError = Boolean(options.failOnError);
  const progress = options.progress !== false;

  return async function translateJsonWithOpenAICompatibleApi({
    locale,
    sourceLocale,
    missingTexts,
  }) {
    if (missingTexts.length === 0) return {};

    const translatedMessages = {};
    const batches = chunk(missingTexts, batchSize);
    let completed = 0;
    let translatedCount = 0;

    if (progress) {
      console.log(
        `[literal-i18n] ${locale}: translating ${missingTexts.length} missing messages with ${model} in ${batches.length} batch(es).`,
      );
    }

    for (const [batchIndex, texts] of batches.entries()) {
      try {
        const translations = await postOpenAICompatibleChat({
          baseUrl,
          apiKey,
          model,
          texts,
          sourceLocale,
          targetLocale: locale,
          prompt,
          temperature,
          thinking,
          timeoutMs,
        });

        texts.forEach((text, index) => {
          const translated = translations[index];
          if (typeof translated === 'string' && translated.trim()) {
            translatedMessages[text] = translated;
            translatedCount += 1;
          }
        });
        completed += texts.length;

        if (progress) {
          console.log(
            `[literal-i18n] ${locale}: online batch ${batchIndex + 1}/${batches.length} done, ${completed}/${missingTexts.length} processed, ${translatedCount} translated.`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[literal-i18n] online translate failed for ${locale}: ${message}`);

        if (failOnError) {
          throw error;
        }
      }
    }

    if (progress) {
      console.log(
        `[literal-i18n] ${locale}: online translation complete, ${translatedCount}/${missingTexts.length} messages translated.`,
      );
    }

    return translatedMessages;
  };
}

function createDeepSeekTranslateJsonHook(options = {}) {
  return createOpenAICompatibleTranslateJsonHook(options);
}

function createLocalTranslateJsonHook(options = {}) {
  const endpoint = requireOption(options.endpoint, 'endpoint').replace(/\/$/, '');
  const batchSize = normalizePositiveInteger(options.batchSize, DEFAULT_BATCH_SIZE);
  const timeoutMs = normalizePositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);
  const prompt = options.prompt;
  const failOnError = Boolean(options.failOnError);
  const progress = options.progress !== false;

  return async function translateJsonWithLocalApi({
    locale,
    sourceLocale,
    missingTexts,
  }) {
    if (missingTexts.length === 0) return {};

    const translatedMessages = {};
    const batches = chunk(missingTexts, batchSize);
    let completed = 0;
    let translatedCount = 0;

    if (progress) {
      console.log(
        `[literal-i18n] ${locale}: translating ${missingTexts.length} missing messages in ${batches.length} batch(es).`,
      );
    }

    for (const [batchIndex, texts] of batches.entries()) {
      try {
        const payload = await postJson(
          `${endpoint}/translate/batch`,
          {
            texts,
            target: locale,
            source: sourceLocale,
            ...(prompt ? { prompt } : {}),
          },
          timeoutMs,
        );
        const translations = Array.isArray(payload.translations) ? payload.translations : [];

        texts.forEach((text, index) => {
          const translated = translations[index];
          if (typeof translated === 'string' && translated.trim()) {
            translatedMessages[text] = translated;
            translatedCount += 1;
          }
        });
        completed += texts.length;

        if (progress) {
          console.log(
            `[literal-i18n] ${locale}: batch ${batchIndex + 1}/${batches.length} done, ${completed}/${missingTexts.length} processed, ${translatedCount} translated.`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[literal-i18n] local translate failed for ${locale}: ${message}`);

        if (failOnError) {
          throw error;
        }
      }
    }

    if (progress) {
      console.log(
        `[literal-i18n] ${locale}: translation complete, ${translatedCount}/${missingTexts.length} messages translated.`,
      );
    }

    return translatedMessages;
  };
}

module.exports = {
  createDeepSeekTranslateJsonHook,
  createLocalTranslateJsonHook,
  createOpenAICompatibleTranslateJsonHook,
};
