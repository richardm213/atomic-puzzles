export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdObject
  | JsonLdValue[];

export type JsonLdObject = {
  "@context"?: string | string[];
  "@type"?: string | string[];
  [key: string]: JsonLdValue | undefined;
};

export type StructuredData = JsonLdObject | JsonLdObject[];
