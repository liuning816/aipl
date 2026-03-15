class UserManager {
    constructor() {
        this.userId = localStorage.getItem('user_id') || null;
        this.token = null;
        this.authenticated = localStorage.getItem('auth_state') === '1';
        this.username = localStorage.getItem('username') || null;
        this.avatarUrl = localStorage.getItem('avatar_url') || null;
    }

    getUserId() {
        return this.userId;
    }

    setUserId(userId) {
        this.userId = userId;
        localStorage.setItem('user_id', userId);
    }

    getUsername() {
        return this.username;
    }

    setUsername(username) {
        this.username = username;
        if (username) {
            localStorage.setItem('username', username);
        } else {
            localStorage.removeItem('username');
        }
    }

    getAvatarUrl() {
        return this.avatarUrl;
    }

    setAvatarUrl(avatarUrl) {
        this.avatarUrl = avatarUrl || "";
        if (this.avatarUrl) {
            localStorage.setItem('avatar_url', this.avatarUrl);
        } else {
            localStorage.removeItem('avatar_url');
        }
    }

    getToken() {
        return this.token;
    }

    setToken(token) {
        this.token = token || null;
        if (token) {
            this.setAuthenticated(true);
        }
    }

    setAuthenticated(value) {
        this.authenticated = Boolean(value);
        if (this.authenticated) {
            localStorage.setItem('auth_state', '1');
        } else {
            localStorage.removeItem('auth_state');
        }
    }

    clearAuth() {
        this.userId = null;
        this.token = null;
        this.authenticated = false;
        this.username = null;
        this.avatarUrl = null;
        localStorage.removeItem('user_id');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('token');
        localStorage.removeItem('auth_state');
        localStorage.removeItem('username');
        localStorage.removeItem('avatar_url');
    }

    isAuthenticated() {
        return Boolean(this.authenticated);
    }

    applyAuthHeader(axiosInstance) {
        if (!axiosInstance || !axiosInstance.defaults) return;
        axiosInstance.defaults.withCredentials = true;
        const token = this.getToken();
        if (token) {
            axiosInstance.defaults.headers.common.Authorization = `Bearer ${token}`;
        } else if (axiosInstance.defaults.headers.common.Authorization) {
            delete axiosInstance.defaults.headers.common.Authorization;
        }
    }
}

const userManager = new UserManager();

export default userManager;