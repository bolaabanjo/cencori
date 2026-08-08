import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { getAllPosts, getPostBySlug } from "@/lib/blog";

export const runtime = "nodejs";
export const dynamic = "force-static";
export const dynamicParams = false;
export const revalidate = false;

const size = {
  width: 1200,
  height: 630,
};

const BACKGROUND_COUNT = 5;

function getFallbackPosts() {
  return getAllPosts()
    .filter(
      (post) =>
        post.published && post.category !== "changelog" && !post.coverImage,
    )
    .sort((a, b) => {
      const dateDifference =
        new Date(a.date).getTime() - new Date(b.date).getTime();

      return dateDifference || a.slug.localeCompare(b.slug);
    });
}

export function generateStaticParams() {
  return getFallbackPosts().map((post) => ({
    slug: `${post.slug}.jpg`,
  }));
}

function getBackgroundNumber(slug: string) {
  const postIndex = getFallbackPosts().findIndex((post) => post.slug === slug);

  return (Math.max(postIndex, 0) % BACKGROUND_COUNT) + 1;
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
      <g clipPath="url(#blog-cencori-mark-clip)">
        <circle cx="35.3" cy="0" r="35.3" fill="#fff" />
        <circle cx="0" cy="64.7" r="35.3" fill="#fff" />
        <circle cx="100" cy="35.3" r="35.3" fill="#fff" />
        <circle cx="64.7" cy="100" r="35.3" fill="#fff" />
      </g>
      <defs>
        <clipPath id="blog-cencori-mark-clip">
          <rect width="100" height="100" rx="3" fill="#fff" />
        </clipPath>
      </defs>
    </svg>
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug: imageSlug } = await params;

  if (!imageSlug.endsWith(".jpg")) {
    return new Response(null, { status: 404 });
  }

  const postSlug = imageSlug.slice(0, -".jpg".length);
  const post = getPostBySlug(postSlug);

  if (
    !post ||
    !post.published ||
    post.category === "changelog" ||
    post.coverImage
  ) {
    return new Response(null, { status: 404 });
  }

  const title = post.title.slice(0, 120);
  const titleFontSize =
    title.length > 82
      ? 44
      : title.length > 60
        ? 50
        : title.length > 38
          ? 56
          : 64;
  const category = post.category
    ? post.category.charAt(0).toUpperCase() + post.category.slice(1)
    : "Blog";
  const date = new Date(post.date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const backgroundNumber = String(getBackgroundNumber(postSlug)).padStart(
    2,
    "0",
  );

  const [backgroundFile, manropeFile, geistFile] = await Promise.all([
    readFile(
      path.join(
        process.cwd(),
        "public",
        "blog",
        "og",
        "backgrounds",
        `${backgroundNumber}.jpg`,
      ),
    ),
    readFile(
      path.join(process.cwd(), "public", "fonts", "manrope-medium.ttf"),
    ),
    readFile(path.join(process.cwd(), "app", "Geist-Black.ttf")),
  ]);
  const backgroundImage = backgroundFile.buffer.slice(
    backgroundFile.byteOffset,
    backgroundFile.byteOffset + backgroundFile.byteLength,
  );
  const manropeFont = manropeFile.buffer.slice(
    manropeFile.byteOffset,
    manropeFile.byteOffset + manropeFile.byteLength,
  );
  const geistFont = geistFile.buffer.slice(
    geistFile.byteOffset,
    geistFile.byteOffset + geistFile.byteLength,
  );

  const pngResponse = new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "#050505",
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
            background:
              "linear-gradient(90deg, rgba(0, 0, 0, 0.82) 0%, rgba(0, 0, 0, 0.58) 52%, rgba(0, 0, 0, 0.12) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(0deg, rgba(0, 0, 0, 0.76) 0%, rgba(0, 0, 0, 0) 64%)",
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
              fontSize: 28,
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: "-0.7px",
            }}
          >
            Cencori
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 64,
            top: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: 1030,
          }}
        >
          <div
            style={{
              display: "flex",
              marginBottom: 20,
              fontFamily: "Manrope, sans-serif",
              fontSize: 17,
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: "2.4px",
              textTransform: "uppercase",
              color: "rgba(255, 255, 255, 0.68)",
            }}
          >
            {category} · {date}
          </div>
          <div
            style={{
              display: "flex",
              width: "100%",
              fontFamily: "Geist, sans-serif",
              fontSize: titleFontSize,
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: "-3.2px",
            }}
          >
            {title}
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
        {
          name: "Geist",
          data: geistFont,
          style: "normal",
          weight: 900,
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
