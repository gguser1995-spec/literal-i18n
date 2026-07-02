import { defineLiteralI18nConfig } from 'literal-i18n/next';
import { createDeepSeekTranslateJsonHook } from 'literal-i18n/local-translate-api';

const apiKey = process.env.LITERAL_I18N_API_KEY?.trim();

/** 当没有配置 API key 时使用的本地回退翻译。 */
function fallbackTranslate(input) {
  if (input.locale !== 'zh') return;
  const map = {
    'Hello World': '你好世界',
    'Welcome to Literal I18n Demo': '欢迎使用 Literal I18n 演示',
    'Hello {name}': '你好，{name}',
    'Home': '首页',
    'Create': '创作',
    'Create music': '创作音乐',
    'Compose a new track from a short idea.': '用一个简短想法创作一首新歌。',
    'Client create panel is ready.': '客户端创作面板已就绪。',
  };
  const result = {};
  for (const key of input.missingTexts) {
    const sourceText = input.sourceMessages?.[key];
    if (sourceText && map[sourceText]) result[key] = map[sourceText];
  }
  return result;
}

const translateJsonHook = apiKey
  ? createDeepSeekTranslateJsonHook({
      apiKey,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-flash',
      batchSize: 20,
      timeoutMs: 120000,
      temperature: 0.1,
      prompt: '你是一位专业的网站 UI 本地化翻译人员。保持译文简洁自然。保留所有占位符不变。',
    })
  : fallbackTranslate;

export default defineLiteralI18nConfig({
  sourceDir: 'src',
  sourceOutput: 'src/messages/en.json',
  sourceMapOutput: 'src/messages/source-map.json',
  localeDir: 'src/messages',
  locales: ['en', 'zh'],
  sourceLocale: 'en',
  keyMode: 'hash',
  idPrefix: 'm_',
  idLength: 16,
  translateJsonHook,
});
