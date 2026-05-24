import { EventBus, SessionUser } from ".";
import { HttpClient } from "./http";

export class AuthManager {
  private _user: SessionUser | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly bus: EventBus,
  ) {}

  get currentUser(): SessionUser | null {
    return this._user;
  }

  get isAuthenticated(): boolean {
    return this._user !== null;
  }

  /**
   * Implicit login: fetches or creates user automatically.
   * No email/password required - each client gets a unique anonymous user ID.
   * Call on SDK init to hydrate the session.
   */
  async loginImplicit(): Promise<SessionUser> {
    try {
      const res = await this.http.request<{ ok: true; data: SessionUser }>(
        "GET",
        "/api/auth/me",
      );
      this._user = res.data;
      this.bus.emit("auth:login", { user: res.data });
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Implicit login failed";
      this.bus.emit("auth:error", { error: msg, context: "implicit-login" });
      throw err;
    }
  }

  /**
   * Clear the local user state (logout).
   * Note: session cookie persists on server; this just clears local state.
   */
  async logout(): Promise<void> {
    try {
      this._user = null;
      this.bus.emit("auth:logout", {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Logout failed";
      this.bus.emit("auth:error", { error: msg, context: "logout" });
      throw err;
    }
  }

  /**
   * Hydrates currentUser from the session — automatically handles implicit login.
   * Call on SDK init to ensure the user is authenticated.
   */
  async me(): Promise<SessionUser> {
    try {
      const res = await this.http.request<{ ok: true; data: SessionUser }>(
        "GET",
        "/api/auth/me",
      );
      this._user = res.data;
      return res.data;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to fetch session user";
      this.bus.emit("auth:error", { error: msg, context: "me" });
      throw err;
    }
  }
}
