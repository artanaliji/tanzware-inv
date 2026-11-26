# Invoice Studio

A static invoice editor with a live Macedonian and Albanian A4 preview. The first visit shows fictional details and line items. The site has no build step or external dependencies.

## Use the editor

1. Open `index.html` locally or visit your published GitHub Pages URL.
2. Select **Edit details** to enter your business details. Select **Save my details in this browser** to reuse them on future visits.
3. Enter the invoice number, issue date, client, and line items. Choose the currency and set the VAT rate for the invoice, or use 0% where applicable.
4. Select **Save PDF**, then choose **Save as PDF** in the browser print dialog. Use A4 portrait and turn off browser headers and footers if they are enabled.
5. Select **New invoice** to clear the invoice fields and keep your business details.

Each browser profile keeps its own business details. On a shared browser profile, clear the **Save my details in this browser** checkbox and apply the change to remove the stored details. Client information and line items exist only on the open page.

## Publish on GitHub Pages

Commit and push the repository files to `main`. In **Settings → Pages**, select **Deploy from a branch**, choose **main** and **/(root)**, and save. Share the URL shown in Pages settings after deployment. [GitHub Pages publishing documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
