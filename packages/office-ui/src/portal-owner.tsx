import { createContext, useContext, useState, type HTMLAttributes } from 'react';

// Undefined preserves standalone body portals; null means an owned host is not mounted yet.
const OfficePortalContainer = createContext<HTMLDivElement | null | undefined>(undefined);

/** Keep editor panels inside the same hidden/inert authority boundary as their native host. */
export function OfficePortalOwner({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  return <OfficePortalContainer.Provider value={container}>
    <div {...props} ref={setContainer}>{children}</div>
  </OfficePortalContainer.Provider>;
}

export function useOfficePortalContainer() {
  return useContext(OfficePortalContainer);
}

/** Global modal listeners must not dismiss input retained by a retired owner. */
export function isOfficePortalInactive(container: HTMLElement | null | undefined): boolean {
  return container === null || !!container?.closest('[hidden], [inert]');
}
