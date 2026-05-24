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

  async login(email: string, password: string): Promise<SessionUser> {
    try {
      const res = await this.http.request<{ ok: true; data: SessionUser }>(
        "POST",
        "/api/auth/login",
        { body: { email, password } },
      );
      this._user = res.data;
      this.bus.emit("auth:login", { user: res.data });
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      this.bus.emit("auth:error", { error: msg, context: "login" });
      throw err;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.http.request("POST", "/api/auth/logout");
      this._user = null;
      this.bus.emit("auth:logout", {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Logout failed";
      this.bus.emit("auth:error", { error: msg, context: "logout" });
      throw err;
    }
  }

  async register(
    email: string,
    password: string,
    name?: string,
  ): Promise<SessionUser> {
    try {
      const res = await this.http.request<{ ok: true; data: SessionUser }>(
        "POST",
        "/api/auth/register",
        { body: { email, password, name } },
      );
      this._user = res.data;
      this.bus.emit("auth:register", { user: res.data });
      return res.data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      this.bus.emit("auth:error", { error: msg, context: "register" });
      throw err;
    }
  }

  /** Hydrates currentUser from the session cookie — call on SDK init. */
  async me(): Promise<SessionUser | null> {
    try {
      const res = await this.http.request<{ ok: true; data: SessionUser }>(
        "GET",
        "/api/auth/me",
      );
      this._user = res.data;
      return res.data;
    } catch {
      this._user = null;
      return null;
    }
  }
}
