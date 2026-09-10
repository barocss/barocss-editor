import { TDSMobileAITProvider } from "@toss/tds-mobile-ait";
import { TDSMobileProvider } from "@toss/tds-mobile";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppLoader } from "./AppLoader";
import { inToss } from "./storage-runtime";
import "./index.css";
// The AIT provider reads native safe-area constants. Plain browser previews do
// not have these constants, so use the base TDS provider outside the Toss app.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {inToss ? (
      <TDSMobileAITProvider brandPrimaryColor="#3182f6">
        <AppLoader />
      </TDSMobileAITProvider>
    ) : (
      <TDSMobileProvider
        userAgent={{
          isAndroid: false,
          isIOS: false,
          fontA11y: undefined,
          colorPreference: "light",
          fontScale: 100,
        }}
      >
        <AppLoader />
      </TDSMobileProvider>
    )}
  </StrictMode>,
);
