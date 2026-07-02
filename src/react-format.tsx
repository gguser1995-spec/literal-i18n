import {
  Fragment,
  isValidElement,
  type ReactNode,
} from 'react';
import { PLACEHOLDER_PATTERN, stringifyParam, type TranslateParamValue } from './format';

export type TProps = {
  text: string;
  id?: string;
  params?: TranslateNodeParams;
};

export type TranslateNodeParamValue = TranslateParamValue | ReactNode;
export type TranslateNodeParams = Record<string, TranslateNodeParamValue>;

function isRenderableNode(value: unknown): value is ReactNode {
  return isValidElement(value) || Array.isArray(value);
}

function toTextNode(value: TranslateNodeParamValue): ReactNode {
  if (isRenderableNode(value)) return value;
  return stringifyParam(value as TranslateParamValue) ?? '';
}

export function formatReactMessage(text: string, params?: TranslateNodeParams): ReactNode {
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
