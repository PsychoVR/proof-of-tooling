import { TWITTER_HANDLE, X_URL } from "@/lib/seo";

export function SiteFooter() {
  return (
    <footer className="site">
      <span>
        <a className="by" href="https://sunshinevr.io" target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny fixed-size mark, already optimized */}
          <img src="/brand/sunshinevr-48.png" srcSet="/brand/sunshinevr-48.png 1x, /brand/sunshinevr-96.png 2x" width={22} height={22} alt="" />
          Built by <b>SunshineVR</b>
        </a>
        , a validator who built a tool to count the tools validators build.
      </span>
      <span>
        <a className="linkplain" href={X_URL} target="_blank" rel="noopener noreferrer">
          {TWITTER_HANDLE} on X
        </a>
        {" · "}Tool count of this tool: 1
      </span>
    </footer>
  );
}
