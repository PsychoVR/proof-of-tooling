import { TWITTER_HANDLE, X_URL } from "@/lib/seo";

export function SiteFooter() {
  return (
    <footer className="site">
      <span>
        Built by <b>SunshineVR</b>, a validator who built a tool to count the tools validators build.
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
