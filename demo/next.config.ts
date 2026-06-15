import type { NextConfig } from 'next';
import withLiteralI18n from 'literal-i18n/next';
import literalI18nConfig from './literal-i18n.config.mjs';

const nextConfig: NextConfig = {};

export default withLiteralI18n(nextConfig, literalI18nConfig);
