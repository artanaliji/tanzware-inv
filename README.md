# Invoice Studio

A static invoice editor with a live Macedonian and Albanian A4 preview. The first visit shows fictional details and line items. The site runs without a build step or runtime CDN dependencies.

## Use the editor

1. Open `index.html` locally or visit your published GitHub Pages URL.
2. Select the pencil icon under **Your business** to enter your details and optionally upload a PNG, JPG, WebP, or PDF logo. For a PDF logo, use the published site or a local HTTP server. The first page is converted in your browser. Select **Save my details in this browser** to reuse your details and logo on future visits.
3. Enter the invoice number, issue date, client, and line items. Choose the currency. The VAT rate starts at 18% and the VAT amount starts at zero. Enter a manual amount or select **Calculate VAT automatically** to calculate it from the subtotal and rate.
4. Select **Save PDF** on the published site or a local HTTP server to download an A4 invoice without browser-added headers or footers.
5. Select **New invoice** to clear the invoice fields and keep your business details.

Each browser profile keeps its own business details. On a shared browser profile, clear the **Save my details in this browser** checkbox and apply the change to remove the stored details. Unsaved invoice entries stay on the open page.

For recurring invoices, open **Templates**, name the current invoice, and select **Save template**. A saved template keeps your business and client details, logo, line items, VAT, and labels in this browser. Select **Use** next month to start with those details, today's date, and an empty invoice number.

Select **Edit labels** in the preview to change the text printed on the invoice. Leave a label blank to hide its text while keeping its space. Long labels wrap within their columns. Use `{rate}` in the VAT label to insert the percentage number, and select **Save labels in this browser** to keep your changes for future visits.

Open **Invoice data** and select **Export data** to download a JSON file containing the current invoice, business details, logo, VAT settings, and custom labels. In another browser, open the same menu, select **Import data**, and choose that file. To keep the imported business details for future visits, save them under **Edit details**. Keep the JSON file with your invoice records because it contains the information you entered.

## Publish on GitHub Pages

Commit and push the repository files to `main`. In **Settings → Pages**, select **Deploy from a branch**, choose **main** and **/(root)**, and save. Share the URL shown in Pages settings after deployment. [GitHub Pages publishing documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

PDF logos use [Mozilla PDF.js](https://github.com/mozilla/pdf.js) 6.5.438, distributed under the license in `vendor/pdfjs/LICENSE`. The renderer loads only when a PDF is selected.

Invoice downloads use [jsPDF](https://github.com/parallax/jsPDF) 4.2.1, with Montserrat and Open Sans fonts bundled alongside their licenses. The invoice is generated in the browser.
