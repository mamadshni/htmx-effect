declare global {
  namespace JSX {
    interface GlobalAttributes {
      "hx-get": string;
      "hx-target": string;
      "hx-trigger": string;
      "hx-include": string;
      "hx-swap": string;
      "hx-on--load": string;
    }
    interface IntrinsicElements {
      "ds-search": JSX.Attributes<HTMLElement> & { name?: string };
    }
  }
}

export {};
