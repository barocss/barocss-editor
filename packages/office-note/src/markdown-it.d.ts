declare module 'markdown-it' {
  export default class MarkdownIt {
    constructor(options?: { html?: boolean; breaks?: boolean });
    render(text: string): string;
  }
}
