import { NextResponse } from "next/server";

export function slackActionClosePage(title: string, message: string) {
  const safeTitle = title.replace(/[<>&"]/g, "");
  const safeMessage = message.replace(/[<>&"]/g, "");

  return new NextResponse(
    `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <script>
      setTimeout(function () { window.close(); }, 700);
    </script>
    <style>
      body { font-family: system-ui, sans-serif; padding: 24px; background: #0f1416; color: #f8fafc; }
      p { color: #b7c7c4; }
    </style>
  </head>
  <body>
    <h1>${safeTitle}</h1>
    <p>${safeMessage}</p>
  </body>
</html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
