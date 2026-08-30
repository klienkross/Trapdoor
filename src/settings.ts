export type TrapdoorSettings = {
  endpoint: string;
  model: string;
  apiKey: string;
  debug: boolean;
};

export const DEFAULT_SETTINGS: TrapdoorSettings = {
  endpoint: "",
  model: "",
  apiKey: "",
  debug: false,
};
