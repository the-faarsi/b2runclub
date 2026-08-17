import { Link } from "react-router-dom";
import { Page } from "../components/layout";
import { PageScene } from "../components/scene3d";
import { buttonClass } from "../components/ui";

export function NotFound() {
  return (
    <Page className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <PageScene variant="knot" opacity={0.45} />
      <p className="eyebrow text-gold">Wrong turn</p>
      <h1 className="display mt-4 text-[clamp(48px,12vw,110px)]">404</h1>
      <p className="mt-3 max-w-sm text-[15px] text-ink-2">
        This route isn't on the map. Head back to the calendar and pick a session.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/events" className={buttonClass("gold", "md")}>
          See the calendar
        </Link>
        <Link to="/" className={buttonClass("ghost", "md")}>
          Home
        </Link>
      </div>
    </Page>
  );
}
