import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // public/sw.js —— service worker。它是浏览器直接加载的独立脚本，
    // 有自己的一整套全局变量（self / caches / clients 这些不在普通浏览器环境的清单里），
    // 而且**不经过打包器**，不属于本项目的 TS 源码，用应用的规则去查它只会误报。
    "public/**",
  ]),
]);

export default eslintConfig;
