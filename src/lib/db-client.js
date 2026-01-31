const ERROR_MESSAGES = {
  CLIENT_ONLY: 'Esta función solo puede ser llamada en el cliente',
  MISSING_TOKEN: 'No hay token de autenticación',
  CREDENTIALS_REQUIRED: 'Email y contraseña son requeridos',
  EVENT_REQUIRED: 'Datos del evento son requeridos',
  EVENT_ID_REQUIRED: 'ID del evento es requerido',
  GUEST_DATA_REQUIRED: 'Datos del invitado son requeridos',
  MEMBER_ID_REQUIRED: 'ID del miembro es requerido',
  REGISTRATION_ERROR: 'Error al registrarse para el evento'
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
    // MODIFICADO: Añadir validación para los nuevos campos requeridos
    if (
      !userData?.nombre || 
      !userData?.apellido_paterno ||
      !userData?.correo_electronico || 
      !userData?.contrasena ||
      !userData?.numero_telefono || // Nuevo
      !userData?.usuario_codeforces || // Nuevo
      !userData?.usuario_vjudge || // Nuevo
      !userData?.usuario_omegaup // Nuevo
    ) {
      throw new Error('Nombre, apellido paterno, email, contraseña, teléfono y todos los usuarios de plataformas son requeridos.');
    }

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

// Funciones de Manejo de Eventos
async function getEventos() {
  try {
    if (typeof window === 'undefined') {
      throw new Error(ERROR_MESSAGES.CLIENT_ONLY);
    }

    return await apiRequest('/api/eventos');
  } catch (error) {
    console.error('Error en getEventos:', error);
    throw error;
  }
}

async function getEvento(id) {
  try {
    if (typeof window === 'undefined') {
      throw new Error(ERROR_MESSAGES.CLIENT_ONLY);
    }

    if (!id) {
      throw new Error(ERROR_MESSAGES.EVENT_ID_REQUIRED);
    }

    return await apiRequest(`/api/eventos/${id}`);
  } catch (error) {
    console.error('Error en getEvento:', error);
    throw error;
  }
}

async function createEvento(eventoData) {
  try {
    if (typeof window === 'undefined') {
      throw new Error(ERROR_MESSAGES.CLIENT_ONLY);
    }

    if (!eventoData) {
      throw new Error(ERROR_MESSAGES.EVENT_REQUIRED);
    }

    const formData = new FormData();
    Object.entries(eventoData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    });

    return await apiRequest('/api/admin/eventos', {
      method: 'POST',
      body: formData
    });
  } catch (error) {
    console.error('Error en createEvento:', error);
    throw error;
  }
}

async function updateEvento(id, eventoData) {
  try {
    if (typeof window === 'undefined') {
      throw new Error(ERROR_MESSAGES.CLIENT_ONLY);
    }

    if (!id) {
      throw new Error(ERROR_MESSAGES.EVENT_ID_REQUIRED);
    }

    const formData = new FormData();
    Object.entries(eventoData).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        formData.append(key, value);
      }
    });

    return await apiRequest(`/api/admin/eventos?id=${id}`, {
      method: 'PUT',
      body: formData
    });
  } catch (error) {
    console.error('Error en updateEvento:', error);
    throw error;
  }
}

async function deleteEvento(id) {
  try {
    if (typeof window === 'undefined') {
      throw new Error(ERROR_MESSAGES.CLIENT_ONLY);
    }

    if (!id) {
      throw new Error(ERROR_MESSAGES.EVENT_ID_REQUIRED);
    }

    return await apiRequest(`/api/admin/eventos?id=${id}`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.error('Error en deleteEvento:', error);
    throw error;
  }
}

// Funciones para Manejo de Imágenes de Eventos
async function uploadEventoImages(eventoId, images) {
  try {
    if (typeof window === 'undefined') {
      throw new Error(ERROR_MESSAGES.CLIENT_ONLY);
    }

    if (!eventoId || !images || images.length === 0) {
      throw new Error('ID de evento e imágenes son requeridos');
    }

    const formData = new FormData();
    images.forEach((image) => {
      formData.append('images', image);
    });

    return await apiRequest(`/api/upload/${eventoId}`, {
      method: 'POST',
      body: formData
    });
  } catch (error) {
    console.error('Error en uploadEventoImages:', error);
    throw error;
  }
}

async function deleteEventoImage(eventoId, imageId) {
  try {
    if (typeof window === 'undefined') {
      throw new Error(ERROR_MESSAGES.CLIENT_ONLY);
    }

    if (!eventoId || !imageId) {
      throw new Error('ID de evento e ID de imagen son requeridos');
    }

    return await apiRequest(`/api/upload/${eventoId}?imageId=${imageId}`, {
      method: 'DELETE'
    });
  } catch (error) {
    console.error('Error en deleteEventoImage:', error);
    throw error;
  }
}

async function getEventoImages(eventoId) {
  try {
    if (typeof window === 'undefined') {
      throw new Error(ERROR_MESSAGES.CLIENT_ONLY);
    }

    if (!eventoId) {
      throw new Error(ERROR_MESSAGES.EVENT_ID_REQUIRED);
    }

    return await apiRequest(`/api/upload/${eventoId}`);
  } catch (error) {
    console.error('Error en getEventoImages:', error);
    throw error;
  }
}

// Funciones para Registro a Eventos
async function registerForEvent(eventId, memberId) {
  try {
    if (typeof window === 'undefined') {
      throw new Error(ERROR_MESSAGES.CLIENT_ONLY);
    }

    if (!eventId) {
      throw new Error(ERROR_MESSAGES.EVENT_ID_REQUIRED);
    }

    if (!memberId) {
      throw new Error(ERROR_MESSAGES.MEMBER_ID_REQUIRED);
    }

    return await apiRequest('/api/eventos/register', {
      method: 'POST',
      body: JSON.stringify({ eventId, memberId })
    });
  } catch (error) {
    console.error('Error en registerForEvent:', error);
    throw new Error(`${ERROR_MESSAGES.REGISTRATION_ERROR}: ${error.message}`);
  }
}

async function registerGuestForEvent(eventId, guestData) {
  try {
    if (typeof window === 'undefined') {
      throw new Error(ERROR_MESSAGES.CLIENT_ONLY);
    }

    if (!eventId) {
      throw new Error(ERROR_MESSAGES.EVENT_ID_REQUIRED);
    }

    if (!guestData) {
      throw new Error(ERROR_MESSAGES.GUEST_DATA_REQUIRED);
    }

    return await apiRequest('/api/eventos/register-guest', {
      method: 'POST',
      body: JSON.stringify({ eventId, ...guestData })
    });
  } catch (error) {
    console.error('Error en registerGuestForEvent:', error);
    throw new Error(`${ERROR_MESSAGES.REGISTRATION_ERROR}: ${error.message}`);
  }
}

async function checkEventRegistration(eventId, userId) {
  try {
    if (typeof window === 'undefined') {
      throw new Error(ERROR_MESSAGES.CLIENT_ONLY);
    }

    if (!eventId || !userId) {
      throw new Error('ID de evento y ID de usuario son requeridos');
    }

    return await apiRequest(`/api/eventos/check-register?id=${eventId}&userId=${userId}`);
  } catch (error) {
    console.error('Error en checkEventRegistration:', error);
    return { registered: false, error: error.message };
  }
}



export {
  loginUser,
  logoutUser,
  registerUser,
  getUserData,
  getEventos,
  getEvento,
  createEvento,
  updateEvento,
  deleteEvento,
  uploadEventoImages,
  deleteEventoImage,
  getEventoImages,
  registerForEvent,
  registerGuestForEvent,
  checkEventRegistration
};

// Crear objeto con todas las funciones
const dbClient = {
  loginUser,
  logoutUser,
  registerUser,
  getUserData,
  getEventos,
  getEvento,
  createEvento,
  updateEvento,
  deleteEvento,
  uploadEventoImages,
  deleteEventoImage,
  getEventoImages,
  registerForEvent,
  registerGuestForEvent,
  checkEventRegistration
};

// Exportar el objeto
export default dbClient;