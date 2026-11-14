import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b0b0c" }}>
        <svg width="140" height="140" viewBox="0 0 28 28" fill="none">
          <path fillRule="evenodd" clipRule="evenodd" d="M20.72 3.92C23.8127 3.92 26.3194 6.427 26.3196 9.5196V18.4796C26.3196 21.5724 23.8128 24.0801 20.72 24.0802H7.2796C4.187 24.0799 1.68 21.5722 1.68 18.4796V9.5196C1.6802 6.4271 4.1871 3.9202 7.2796 3.92H20.72ZM7.9251 10.3507C7.7118 10.1983 7.4307 10.178 7.1976 10.2979C6.9646 10.418 6.8177 10.6579 6.8177 10.92V17.0802C6.8178 17.3422 6.9646 17.5822 7.1976 17.7022C7.4307 17.8222 7.7118 17.8019 7.9251 17.6495L12.2366 14.5694C12.4206 14.438 12.5296 14.2261 12.5296 14.0001C12.5296 13.774 12.4205 13.5621 12.2366 13.4307L7.9251 10.3507Z" fill="#fff" />
          <path d="M20.482 8.12V19.88L12.25 14L20.482 8.12Z" fill="#ff5b1f" stroke="#ff5b1f" strokeWidth="1.4" strokeLinejoin="round" />
          <circle cx="22.96" cy="7" r="1.26" fill="#ff5b1f" />
        </svg>
      </div>
    ),
    size,
  );
}
