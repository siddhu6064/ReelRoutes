import { Link, useNavigate } from "react-router-dom";
import { useAppStore } from "@/stores/appStore";
import styles from "./NavBar.module.css";

export default function NavBar() {
  const { userId } = useAppStore();
  const navigate = useNavigate();

  return (
    <nav className={styles.nav}>
      <Link to="/" className={styles.brand}>
        <div className={styles.logo}>◈</div>
        <span className={styles.name}>ReelRoutes</span>
      </Link>

      <div className={styles.right}>
        {userId ? (
          <>
            <Link to="/trips" className={styles.navLink}>My trips</Link>
            {/* Clerk SignOutButton would go here in production */}
            <button
              className={styles.authBtn}
              onClick={() => {
                useAppStore.getState().setUserId(null);
                navigate("/");
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <span className={styles.guestBadge}>Guest mode</span>
            {/* Clerk SignInButton would go here in production */}
            <button
              className={styles.authBtn}
              onClick={() => {
                // Demo: set a mock userId
                useAppStore.getState().setUserId("clerk_demo_user");
              }}
            >
              Sign in (demo)
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
