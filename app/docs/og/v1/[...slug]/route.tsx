import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { source } from "@/lib/source";
import path from "node:path";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = false;

const size = {
  width: 1200,
  height: 630,
};

export function generateStaticParams() {
  return source.generateParams().map(({ slug }) => ({
    slug: [...slug.slice(0, -1), `${slug.at(-1)}.jpg`],
  }));
}

function CencoriMark() {
  return (
    <svg
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 100 100"
      fill="none"
    >
      <g clipPath="url(#cencori-mark-clip)">
        <circle cx="35.3" cy="0" r="35.3" fill="#fff" />
        <circle cx="0" cy="64.7" r="35.3" fill="#fff" />
        <circle cx="100" cy="35.3" r="35.3" fill="#fff" />
        <circle cx="64.7" cy="100" r="35.3" fill="#fff" />
      </g>
      <defs>
        <clipPath id="cencori-mark-clip">
          <rect width="100" height="100" rx="3" fill="#fff" />
        </clipPath>
      </defs>
    </svg>
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug: imageSlug } = await params;
  const filename = imageSlug.at(-1);

  if (!filename?.endsWith(".jpg")) {
    return new Response(null, { status: 404 });
  }

  const docSlug = [
    ...imageSlug.slice(0, -1),
    filename.slice(0, -".jpg".length),
  ];
  const page = source.getPage(docSlug);

  if (!page) {
    return new Response(null, { status: 404 });
  }

  const pageTitle = page.data.title.slice(0, 80);
  const titleFontSize =
    pageTitle.length > 40
      ? 46
      : pageTitle.length > 28
        ? 52
        : pageTitle.length > 20
          ? 60
          : 68;

  const [backgroundFile, manropeFile] = await Promise.all([
    readFile(path.join(process.cwd(), "public", "docs-og-background.jpg")),
    readFile(
      path.join(process.cwd(), "public", "fonts", "manrope-medium.ttf"),
    ),
  ]);
  const backgroundImage = backgroundFile.buffer.slice(
    backgroundFile.byteOffset,
    backgroundFile.byteOffset + backgroundFile.byteLength,
  );
  const manropeFont = manropeFile.buffer.slice(
    manropeFile.byteOffset,
    manropeFile.byteOffset + manropeFile.byteLength,
  );

  const pngResponse = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 4,
          background: "#080808",
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            width: "100%",
            height: "100%",
            overflow: "hidden",
            border: "2px solid #2b2b2b",
            borderRadius: 36,
            background: "#080808",
            color: "#ffffff",
          }}
        >
          {/* next/image is not supported inside ImageResponse. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src={backgroundImage as unknown as string}
            width="1200"
            height="630"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              background: "rgba(0, 0, 0, 0.22)",
            }}
          />

          <div
            style={{
              position: "absolute",
              top: 58,
              left: 64,
              display: "flex",
              alignItems: "center",
              gap: 18,
            }}
          >
            <CencoriMark />
            <div
              style={{
                display: "flex",
                width: 1,
                height: 24,
                background: "rgba(255, 255, 255, 0.45)",
              }}
            />
            <div
              style={{
                display: "flex",
                fontFamily: "Manrope, sans-serif",
                fontSize: 30,
                fontWeight: 500,
                lineHeight: 1,
                letterSpacing: "-0.8px",
              }}
            >
              Cencori
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              top: 281,
              left: 64,
              display: "flex",
              fontFamily: "Arial, Helvetica, sans-serif",
              width: 1040,
              fontSize: titleFontSize,
              fontWeight: 400,
              lineHeight: 1.06,
              letterSpacing: "-3.8px",
            }}
          >
            {pageTitle}
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Manrope",
          data: manropeFont,
          style: "normal",
          weight: 500,
        },
      ],
    },
  );
  const png = Buffer.from(await pngResponse.arrayBuffer());
  const jpeg = await sharp(png)
    .jpeg({
      quality: 82,
      progressive: true,
      chromaSubsampling: "4:2:0",
      mozjpeg: true,
    })
    .toBuffer();
  const body = new ArrayBuffer(jpeg.byteLength);
  new Uint8Array(body).set(jpeg);

  return new Response(body, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "CDN-Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(jpeg.byteLength),
      "Content-Type": "image/jpeg",
      "Vercel-CDN-Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
