export const LAB_ACCESS_STORAGE_KEY = 'la-corte-3d-lab-access';
export const LAB_ACCESS_QUERY_KEY = 'labKey';

const readAccess = (storage) => {
  try {
    return storage?.getItem(LAB_ACCESS_STORAGE_KEY) === 'granted';
  } catch {
    return false;
  }
};

export function consumeLabAccess({ href, secret, storage }) {
  const url = new URL(href);
  const suppliedKey = url.searchParams.get(LAB_ACCESS_QUERY_KEY);
  const consumed = suppliedKey !== null;

  if (consumed) {
    url.searchParams.delete(LAB_ACCESS_QUERY_KEY);
    if (secret && suppliedKey === secret) {
      try {
        storage?.setItem(LAB_ACCESS_STORAGE_KEY, 'granted');
      } catch {
        // O acesso vale somente onde armazenamento local está disponível.
      }
    }
  }

  return {
    allowed: readAccess(storage),
    consumed,
    cleanPath: `${url.pathname}${url.search}${url.hash}`,
  };
}
