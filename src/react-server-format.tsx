import { Fragment, isValidElement, type ReactNode } from 'react';
import { PLACEHOLDER_PATTERN, stringifyParam, type TranslateParamValue } from './format';

export type ServerTranslateNodeParamValue = TranslateParamValue | ReactNode;
export type ServerTranslateNodeParams = Record<string, ServerTranslateNodeParamValue>;

function isRenderableNode(value: unknown): value is ReactNode {
  return isValidElement(value) || Array.isArray(value);
}

function toTextNode(value: ServerTranslateNodeParamValue): ReactNode {
  if (isRenderableNode(value)) return value;
  return stringifyParam(value as TranslateParamValue) ?? '';
}

export function formatServerReactMessage(text: string, params?: ServerTranslateNodeParams): ReactNode {
  if (!params) return text;

  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  PLACEHOLDER_PATTERN.lastIndex = 0;

  while ((match = PLACEHOLDER_PATTERN.exec(text))) {
    const [placeholder, name] = match;
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (Object.prototype.hasOwnProperty.call(params, name)) {
      nodes.push(
        <Fragment key={`${name}-${match.index}`}>
          {toTextNode(params[name])}
        </Fragment>,
      );
    } else {
      nodes.push(placeholder);
    }

    lastIndex = match.index + placeholder.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length === 1 ? nodes[0] : nodes;
}
