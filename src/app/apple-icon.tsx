import { ImageResponse } from "next/og";

// 180×180 is the size iOS uses when you Add to Home Screen. Rendered as a
// solid near-black orb on a transparent canvas: iOS keeps the alpha, so
// what you see on the home screen is a round pill (not a rounded square
// with corners), the same silhouette Chrome / Safari ship.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 174,
            height: 174,
            borderRadius: "50%",
            background:
              "linear-gradient(135deg, #0f0f0f 0%, #1f1f1f 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          <svg
            width="110"
            height="110"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#eeeeee"
            strokeWidth={1.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="m14.31 8 5.74 9.94" />
            <path d="M9.69 8h11.48" />
            <path d="m7.38 12 5.74-9.94" />
            <path d="M9.69 16 3.95 6.06" />
            <path d="M14.31 16H2.83" />
            <path d="m16.62 12-5.74 9.94" />
          </svg>
        </div>
      </div>
    ),
    { ...size }
  );
}
