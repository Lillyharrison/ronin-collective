export const activeCount = (count: number, es: boolean) => `${count} ${es ? count === 1 ? 'activa' : 'activas' : 'active'}`;
export const itemCount = (count: number, es: boolean) => `${count} ${es ? count === 1 ? 'artículo' : 'artículos' : count === 1 ? 'item' : 'items'}`;
export const addedCount = (count: number, es: boolean) => `${count} ${es ? count === 1 ? 'añadido' : 'añadidos' : 'added'}`;
export const photoRequestName = (name: string, es: boolean) => es && name === 'Photo request' ? 'Solicitud con foto' : name;
export const newRequestName = (name: string, es: boolean) => name.trim() || (es ? 'Solicitud con foto' : 'Photo request');
