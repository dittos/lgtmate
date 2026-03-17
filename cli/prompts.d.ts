declare module "prompts" {
  type PromptChoice = {
    title: string;
    value: string;
  };

  type PromptQuestion = {
    type: string;
    name: string;
    message: string;
    choices?: PromptChoice[];
    initial?: number;
  };

  type PromptOptions = {
    onCancel?: () => boolean;
  };

  export default function prompts(
    question: PromptQuestion,
    options?: PromptOptions
  ): Promise<{ provider?: string }>;
}
