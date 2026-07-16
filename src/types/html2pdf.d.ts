declare module 'html2pdf.js' {
  interface Html2PdfWorker {
    set(options: Record<string, unknown>): Html2PdfWorker;
    from(element: HTMLElement | string): Html2PdfWorker;
    save(): Promise<void>;
    output(type?: string, options?: unknown): Promise<unknown>;
    then(onFulfilled?: (value: unknown) => unknown): Html2PdfWorker;
  }
  function html2pdf(): Html2PdfWorker;
  export default html2pdf;
}
