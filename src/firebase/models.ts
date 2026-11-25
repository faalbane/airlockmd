import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  Schema,
  type GenerativeModel,
} from "firebase/ai";
import type { FirebaseApp } from "firebase/app";
import { IDENTIFIER_TYPES } from "../types";

const CLOUD_MODEL = "gemini-3.5-flash-lite";

const identifierSchema = Schema.object({
  properties: {
    entities: Schema.array({
      items: Schema.object({
        properties: {
          type: Schema.enumString({
            enum: [...IDENTIFIER_TYPES],
          }),
          text: Schema.string(),
          start: Schema.number(),
          end: Schema.number(),
        },
      }),
    }),
    extractedText: Schema.string(),
  },
});

const injectionSchema = Schema.object({
  properties: {
    verdict: Schema.enumString({
      enum: ["SAFE", "SUSPICIOUS", "INJECTION_DETECTED"],
    }),
    spans: Schema.array({
      items: Schema.object({
        properties: {
          text: Schema.string(),
          reason: Schema.string(),
        },
      }),
    }),
  },
});

const appealSchema = Schema.object({
  properties: {
    title: Schema.string(),
    letter: Schema.string(),
    citedFacts: Schema.array({ items: Schema.string() }),
  },
});

const leakSchema = Schema.object({
  properties: {
    verdict: Schema.enumString({ enum: ["CLEAN", "LEAK"] }),
    spans: Schema.array({
      items: Schema.object({
        properties: {
          text: Schema.string(),
          reason: Schema.string(),
        },
      }),
    }),
  },
});

export type AirlockModels = {
  intake: GenerativeModel;
  integrity: GenerativeModel;
  leak: GenerativeModel;
  appeal: GenerativeModel;
  appealText: GenerativeModel;
  handout: GenerativeModel;
};

/**
 * Runtime Firebase AI Logic clients.
 * Images are passed only to `intake`, which is ONLY_ON_DEVICE.
 * `handout` is PREFER_ON_DEVICE and must receive tokenized text. Callers check that first.
 */
export function createAirlockModels(app: FirebaseApp): AirlockModels {
  const ai = getAI(app, {
    backend: new GoogleAIBackend(),
    useLimitedUseAppCheckTokens: true,
  });

  const intake = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [
          { type: "text", languages: ["en"] },
          { type: "image" },
        ],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
        initialPrompts: [
          {
            role: "system",
            content: [
              {
                type: "text",
                value:
                  "You extract likely personal identifiers from clinical text or a document image. You do not give medical advice. Return only structured data.",
              },
            ],
          },
        ],
      },
      promptOptions: { responseConstraint: identifierSchema },
    },
  });

  const integrity = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      },
      promptOptions: { responseConstraint: injectionSchema },
    },
  });

  const leak = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      },
      promptOptions: { responseConstraint: leakSchema },
    },
  });

  const appeal = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: CLOUD_MODEL,
      tools: [{ googleSearch: {} }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: appealSchema,
      },
    },
  });

  const appealText = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: CLOUD_MODEL,
      tools: [{ googleSearch: {} }],
    },
  });

  const handout = getGenerativeModel(ai, {
    mode: InferenceMode.PREFER_ON_DEVICE,
    inCloudParams: {
      model: CLOUD_MODEL,
      generationConfig: {
        responseMimeType: "text/plain",
      },
    },
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
      },
    },
  });

  return { intake, integrity, leak, appeal, appealText, handout };
}

export async function fileToGenerativePart(file: File): Promise<{
  type: "inlineData";
  inlineData: { data: string; mimeType: string };
}> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const comma = dataUrl.indexOf(",");
  return {
    type: "inlineData",
    inlineData: { data: dataUrl.slice(comma + 1), mimeType: file.type || "image/png" },
  };
}
