# schemaguard 🛡️

[![CI](https://github.com/AgnetAcount/schemaguard/actions/workflows/ci.yml/badge.svg)](https://github.com/AgnetAcount/schemaguard/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node: >=18.0.0](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)
[![Author: Agnet Software Corp.](https://img.shields.io/badge/org-Agnet%20Software%20Corp.-orange)](https://github.com/AgnetAcount)

> **Zero-dependency schema validator, drift detector, and contract testing toolkit for AI agent tool definitions (OpenAI, Anthropic Claude, Google Gemini, and Model Context Protocol - MCP).**

---

## ⚡ Why schemaguard?

In modern AI agent systems, **tool-calling errors, malformed JSON schemas, and parameter hallucinations are the #1 cause of production agent crashes**.

Different LLM providers enforce subtly conflicting expectations:
- **OpenAI** requires `type: "object"` at the root, strict `additionalProperties: false` for Structured Outputs, and breaks when unsupported keywords (`$ref`, `$schema`) are present.
- **Anthropic Claude** requires an `input_schema` wrapper and demands explicit property descriptions for prompt steerability.
- **Google Gemini** requires function declarations with explicit types and parameters.
- **Model Context Protocol (MCP)** standardizes client-server tool invocation via `inputSchema`.

`schemaguard` solves this with a **zero-dependency, microsecond-fast engine** that audits, converts, mocks, and validates AI tool schemas across every major provider.

---

## 🚀 Key Features

- **🔍 Multi-Provider Linter & Quality Scorer:** Inspects tool schemas against 12+ LLM compliance rules (missing descriptions, vague names, depth limits, broken numeric bounds, unsupported meta-keywords) and outputs an actionable 0-100 quality score.
- **🔄 Universal Format Converter:** Seamlessly converts tool schemas between **OpenAI Functions**, **Anthropic Tools**, **Google Gemini**, and **Model Context Protocol (MCP)**.
- **🧪 Synthetic Mock Payload Generator:** Automatically generates valid happy-path, minimal required, or boundary-testing edge payloads to unit-test your tool handlers without spending money on LLM API tokens.
- **⚡ Microsecond Runtime Validator:** Verifies LLM tool argument payloads against schema contracts with microsecond latency and zero external dependencies.
- **📝 Automated TypeScript Typegen:** Derives strongly-typed TypeScript interfaces complete with JSDoc comments, optional indicators, and enum literal unions directly from tool schemas.
- **📦 Zero Runtime Dependencies:** Pure modern ES Modules with zero third-party dependencies, eliminating supply-chain vulnerabilities and keeping bundle overhead at 0KB.

---

## 📦 Installation

Run instantly via `npx` or install globally:

```bash
# Direct execution without install
npx schemaguard lint ./tool.json

# Global install
npm install -g schemaguard
# or
pnpm add -g schemaguard
```

---

## 💻 CLI Usage

### 1. Audit and Lint Tool Schemas
```bash
# Standard lint with visual quality score
schemaguard lint ./tools/search_tool.json

# Strict mode (enforces OpenAI Structured Outputs constraints)
schemaguard lint ./tools/search_tool.json --strict

# CI mode (outputs GitHub Actions workflow annotations ::error and ::warning)
schemaguard lint ./tools/search_tool.json --ci
```

### 2. Convert Between AI Providers
```bash
# Convert OpenAI tool to Anthropic Claude format
schemaguard convert ./openai_tool.json --to anthropic --out ./anthropic_tool.json

# Convert to Model Context Protocol (MCP) tool format
schemaguard convert ./openai_tool.json --to mcp --out ./mcp_tool.json

# Convert to OpenAI Structured Outputs format with strict mode
schemaguard convert ./any_tool.json --to openai --strict
```

### 3. Generate Synthetic Mock Payloads
```bash
# Happy path mock payload
schemaguard mock ./tools/weather.json --mode happy

# Minimal payload (required fields only)
schemaguard mock ./tools/weather.json --mode minimal

# Boundary edge test payload (min/max limits, extremes)
schemaguard mock ./tools/weather.json --mode edge
```

### 4. Generate TypeScript Types
```bash
# Generate TypeScript interfaces with JSDoc
schemaguard typegen ./tools/weather.json --out ./src/types/weather.ts
```

### 5. Validate Runtime Arguments
```bash
# Validate actual LLM call arguments against tool schema
schemaguard validate ./tool_schema.json ./llm_output_args.json
```

---

## 🛠️ Programmatic TypeScript / JavaScript API

`schemaguard` provides a clean, fully-typed programmatic API:

```typescript
import {
  lintTool,
  normalizeToUniversal,
  exportTo,
  generateMock,
  validateRuntimePayload,
  generateTypeScriptTypes
} from 'schemaguard';

// 1. Audit Tool Quality
const audit = lintTool(myToolDefinition, { strictMode: true });
console.log(`Quality Score: ${audit.score}/100, Valid: ${audit.valid}`);

// 2. Convert Formats
const universalTool = normalizeToUniversal(myAnthropicTool);
const openAiSchema = exportTo(universalTool, 'openai', { strict: true });

// 3. Generate Unit Test Arguments
const mockArgs = generateMock(universalTool, { mode: 'happy' });

// 4. Validate LLM Arguments at Runtime (<1ms)
const validation = validateRuntimePayload(universalTool, llmRawArguments);
if (!validation.valid) {
  console.error('LLM Argument Hallucination:', validation.errors);
}

// 5. Generate TypeScript Interfaces
const tsCode = generateTypeScriptTypes(universalTool);
```

---

## 🏛️ Supported AI Providers & Ecosystems

| Provider / Standard | Format Support | Conversion | Strict Mode | Mocking | Typegen |
|---|:---:|:---:|:---:|:---:|:---:|
| **OpenAI** (GPT-4o, o1, o3-mini) | ✅ Full | ✅ Yes | ✅ Supported | ✅ Yes | ✅ Yes |
| **Anthropic Claude** (3.5 Sonnet, 3.7) | ✅ Full | ✅ Yes | ✅ Supported | ✅ Yes | ✅ Yes |
| **Google Gemini** (1.5 Pro, 2.0 Flash) | ✅ Full | ✅ Yes | ✅ Supported | ✅ Yes | ✅ Yes |
| **Model Context Protocol (MCP)** | ✅ Full | ✅ Yes | ✅ Supported | ✅ Yes | ✅ Yes |
| **JSON Schema Draft 07 / 2020-12** | ✅ Full | ✅ Yes | ✅ Supported | ✅ Yes | ✅ Yes |

---

## 🧪 Testing

`schemaguard` is covered by a 100% passing native test suite:

```bash
pnpm test
```

---

## 📄 License

MIT © [Agnet Software Corp.](https://github.com/AgnetAcount)
