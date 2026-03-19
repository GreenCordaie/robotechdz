"use client";

import { useCallback } from "react";

export const useThermalPrinter = () => {
    const printToIframe = useCallback((orderNumber: string, htmlContent: string) => {
        // 1. Create a hidden iframe if it doesn't exist
        let iframe = document.getElementById('thermal-print-iframe') as HTMLIFrameElement;
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = 'thermal-print-iframe';
            iframe.style.position = 'fixed';
            iframe.style.right = '0';
            iframe.style.bottom = '0';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = 'none';
            document.body.appendChild(iframe);
        }

        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) {
            console.error("Iframe document not accessible");
            return false;
        }

        const printWindow = iframe.contentWindow;
        if (!printWindow) return false;

        // 2. Capture all styles from the main document to ensure Tailwind/HeroUI classes work
        const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
            .map(style => style.outerHTML)
            .join('\n');

        // 3. Construct the localized HTML for the printer
        const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Ticket #${orderNumber}</title>
          ${styles}
          <style>
            @media print {
              @page {
                size: 80mm auto;
                margin: 0;
              }
              body {
                margin: 0;
                padding: 0;
                width: 80mm;
                background: white !important;
              }
              #thermal-print-wrapper {
                width: 80mm !important;
                margin: 0 !important;
                padding: 0 !important;
                display: block !important;
                background: white !important;
              }
              * {
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
            body {
              background: white;
              font-family: 'Courier New', Courier, monospace;
            }
          </style>
        </head>
        <body>
          <div id="thermal-print-wrapper">
            ${htmlContent}
          </div>
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
              }, 300);
            };
          </script>
        </body>
      </html>
    `;

        doc.open();
        doc.write(html);
        doc.close();

        return true;
    }, []);

    return { printToIframe };
};
