import { store } from "../store/store";

export const AuthService = {
  getTokens: () => {
    try {
      const storedToken = sessionStorage.getItem("tk");
      if (storedToken) {
        const parsedToken = JSON.parse(storedToken);
        if (parsedToken?.token) {
          return parsedToken.token;
        }
      }
    } catch {
      sessionStorage.removeItem("tk");
    }

    if (store.getState().busOwner.info.token) {
      return store.getState().busOwner.info.token;
    } else if (store.getState().passenger.info.token) {
      return store.getState().passenger.info.token;
    } else {
      return null;
    }
  },
  setTokens: (token) => {
    sessionStorage.setItem("tk", JSON.stringify({ token }));
  },
  logout: () => {
    sessionStorage.removeItem("tk");
  },
};
