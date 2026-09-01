// Cliente HTTP de autenticación usado por AuthContext.
//
// Antes este módulo exportaba 15 funciones "de API" y la mitad apuntaba a rutas
// que no existen (/api/eventos/register-guest, /api/upload/[id]) o usaba el
// verbo equivocado (/api/admin/eventos?id= con PUT/DELETE, cuando esos métodos
// viven en /api/admin/eventos/[id]). Cualquiera que las reutilizara se llevaba
// un 404 silencioso. El resto de la aplicación llama a sus endpoints con fetch
// o SWR directamente, así que aquí sólo queda lo que se usa de verdad.

const ERROR_MESSAGES = {
  CLIENT_ONLY: 'Esta función solo puede ser llamada en el cliente',
  CREDENTIALS_REQUIRED: 'Email y contraseña son requeridos',
};

async function apiRequest(url, options = {}) {
  try {
    const defaultOptions = {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    };

    // Si es FormData, no establecer Content-Type para que el navegador lo haga
    if (options.body instanceof FormData) {
      delete defaultOptions.headers['Content-Type'];
    }

    const fetchOptions = {
      ...defaultOptions,
      ...options,
      headers: { ...defaultOptions.headers, ...(options.headers || {}) }
    };

    const response = await fetch(url, fetchOptions);

    // Verificar si la respuesta es JSON o no
    const contentType = response.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");

    if (!response.ok) {
      if (isJson) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error en solicitud a ${url}: ${response.status}`);
      } else {
        throw new Error(`Error en solicitud a ${url}: ${response.status}`);
      }
    }

    if (isJson) {
      return await response.json();
    } else {
      return { success: true, message: 'Operación exitosa' };
    }
  } catch (error) {
    console.error(`Error en solicitud a ${url}:`, error);
    throw error;
  }
}

// Funciones de Autenticación
async function loginUser(credentials) {
  try {
    if (!credentials?.correo_electronico || !credentials?.contrasena) {
      throw new Error(ERROR_MESSAGES.CREDENTIALS_REQUIRED);
    }

    const response = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });

    return response;
  } catch (error) {
    console.error('Error en loginUser:', error);
    throw error;
  }
}

async function logoutUser() {
  try {
    return await apiRequest('/api/auth/logout', {
      method: 'POST'
    });
  } catch (error) {
    console.error('Error en logoutUser:', error);
    throw error;
  }
}

async function registerUser(userData) {
  try {
    // Sin validación propia a propósito: la única fuente de verdad de qué campos
    // son obligatorios es `authRegisterSchema` (src/lib/validation.js), y ahora
    // depende de la afiliación (los handles de plataforma sólo se piden a quien
    // entra al club; el número IEEE sólo a Computer Society). La copia que había
    // aquí exigía los tres handles a todo el mundo y ni siquiera dejaba salir la
    // petición, así que ningún arreglo del servidor habría tenido efecto.
    const response = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });

    return response;
  } catch (error) {
    console.error('Error en registerUser:', error);
    throw error;
  }
}

async function getUserData() {
  try {
    if (typeof window === 'undefined') {
      throw new Error(ERROR_MESSAGES.CLIENT_ONLY);
    }

    return await apiRequest('/api/auth/verify');
  } catch (error) {
    console.error('Error en getUserData:', error);
    throw error;
  }
}

export {
  loginUser,
  logoutUser,
  registerUser,
  getUserData,
};

const dbClient = {
  loginUser,
  logoutUser,
  registerUser,
  getUserData,
};

export default dbClient;
