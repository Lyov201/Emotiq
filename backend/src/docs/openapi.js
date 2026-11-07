const ref = name => ({ $ref: `#/components/schemas/${name}` });
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const string = { type: 'string' };
const uuid = { type: 'string', format: 'uuid' };
const dateTime = { type: 'string', format: 'date-time' };
const nullableTime = { ...dateTime, nullable: true };
const page = [
  { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100000, default: 1 } },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
];
const id = { name: 'id', in: 'path', required: true, schema: uuid };
const csrf = { name: 'X-CSRF-Protection', in: 'header', required: true, schema: { type: 'string', enum: ['1'], default: '1' } };
const json = schema => ({ 'application/json': { schema } });
const response = (schema, description = 'Success') => ({ description, content: json(schema) });
const envelope = properties => object({ success: { type: 'boolean', enum: [true] }, message: string, data: object(properties) }, ['success', 'data']);
const body = schema => ({ required: true, content: json(schema) });
const errors = Object.fromEntries([400, 401, 403, 404, 409, 413, 429, 500, 502, 503, 504].map(code => [code, response(ref('Error'), ({400:'Validation failed',401:'Authentication required',403:'CSRF validation failed',404:'Not found',409:'Conflict',413:'Body too large',429:'Rate limit exceeded',500:'Internal error',502:'AI unavailable or blocked response',503:'Database or AI unavailable / quota exhausted',504:'AI response timed out'})[code])]));
function operation(tag, summary, schema, options = {}) {
  const { status = 200, ...rest } = options;
  return { tags: [tag], summary, responses: { [status]: schema ? response(schema) : { description: 'Logged out (empty body)' }, ...errors }, ...rest };
}
const bookingResponse = envelope({ booking: ref('Booking') });
const sessionResponse = envelope({ session: ref('Session') });
const paged = (name, schema) => envelope({ [name]: { type: 'array', items: schema }, pagination: ref('Pagination') });

export const openapi = {
  openapi: '3.0.3',
  info: { title: 'Emotiq API', version: '1.0.0', description: `Emotional support API. Start with register → login → Authorize (paste data.accessToken) → availability → booking → session → messages. Authentication POSTs require X-CSRF-Protection: 1 and an allowed browser Origin. Swagger supplies the custom header automatically; the browser supplies Origin. Local development accepts http://localhost on the configured backend port for Swagger. Refresh tokens use an HttpOnly cookie; Swagger does not expose them. Do not enter your Gemini API key here. Try it out performs real writes and message sends consume your Google quota. Use fictional conversations with the Gemini free tier. Sessions start only during their booked time.` },
  servers: [{ url: '/', description: 'This API server' }],
  tags: ['Health', 'Authentication', 'Bookings', 'Sessions', 'Moods', 'Journals'].map(name => ({ name })),
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      refreshCookie: { type: 'apiKey', in: 'cookie', name: 'emotiq_refresh', description: 'Set automatically by login; browser manages this HttpOnly cookie.' },
    },
    schemas: {
      Error: { type: 'object', properties: { success: { type: 'boolean', enum: [false] }, message: string,
        errors: { type: 'array', items: object({ field: string, message: string }) } }, required: ['success', 'message'] },
      User: object({ id: uuid, name: string, email: { type: 'string', format: 'email' } }),
      Pagination: object({ page: { type: 'integer' }, limit: { type: 'integer' }, total: { type: 'integer' }, totalPages: { type: 'integer' } }),
      Booking: object({ id: uuid, userId: uuid, startTime: dateTime, endTime: dateTime,
        status: { type: 'string', enum: ['SCHEDULED', 'CANCELLED', 'COMPLETED', 'MISSED'] }, createdAt: dateTime }),
      Session: object({ id: uuid, userId: uuid, bookingId: uuid, status: { type: 'string', enum: ['PENDING', 'ACTIVE', 'COMPLETED', 'EXPIRED'] },
        startedAt: nullableTime, endedAt: nullableTime, createdAt: dateTime }),
      Message: object({ id: uuid, role: { type: 'string', enum: ['USER', 'ASSISTANT'] }, content: string, createdAt: dateTime }),
      Slot: object({ startTime: dateTime, endTime: dateTime, capacity: { type: 'integer', enum: [3] }, remainingPlaces: { type: 'integer' }, bookedByYou: { type: 'boolean' }, available: { type: 'boolean' } }),
    },
  },
  paths: {
    '/': { get: { tags: ['Health'], summary: 'Root greeting', security: [], responses: { 200: { description: 'Hello World', content: { 'text/plain': { schema: string } } } } } },
    '/api/health': { get: operation('Health', 'API health', object({ success: { type: 'boolean' }, message: string }), { security: [] }) },
    '/api/health/db': { get: operation('Health', 'Database connectivity', object({ success: { type: 'boolean' }, message: string }), { security: [] }) },
    '/api/auth/register': { post: operation('Authentication', 'Register (does not log in)', { type: 'object', properties: { ...envelope({ user: ref('User') }).properties, message: string } }, {
      security: [], status: 201, parameters: [csrf], requestBody: body(object({
        name: { type: 'string', minLength: 2, maxLength: 100, example: 'Emotiq Tester' },
        email: { type: 'string', format: 'email', maxLength: 255, example: 'tester@example.com' },
        password: { type: 'string', minLength: 12, maxLength: 128, format: 'password', example: 'ExamplePassword123!' },
      })),
    }) },
    '/api/auth/login': { post: operation('Authentication', 'Log in and set refresh cookie', envelope({ user: ref('User'), accessToken: string, expiresIn: { type: 'integer', enum: [900] } }), {
      security: [], parameters: [csrf], requestBody: body(object({ email: { type: 'string', format: 'email', example: 'tester@example.com' }, password: { type: 'string', minLength: 1, maxLength: 128, format: 'password', example: 'ExamplePassword123!' } })),
      description: 'Copy data.accessToken into Authorize. The browser stores the refresh cookie. Register first if needed.',
    }) },
    '/api/auth/me': { get: operation('Authentication', 'Your profile', envelope({ user: ref('User') })) },
    '/api/auth/refresh': { post: operation('Authentication', 'Rotate refresh token', envelope({ accessToken: string, expiresIn: { type: 'integer', enum: [900] } }), { security: [{ refreshCookie: [] }], parameters: [csrf], description: 'Login first in this browser. Copy the new accessToken into Authorize. Avoid concurrent refresh requests.' }) },
    '/api/auth/logout': { post: operation('Authentication', 'Revoke refresh cookie', null, { status: 204, security: [], parameters: [csrf] }) },
    '/api/bookings/availability': { get: operation('Bookings', 'Available 30-minute slots (up to 90 days)', envelope({ date: { type: 'string', format: 'date' }, timezone: string, slotDurationMinutes: { type: 'integer', enum: [30] }, slots: { type: 'array', items: ref('Slot') } }), {
      parameters: [{ name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date' }, description: 'Choose a current/future local calendar date.' }, { name: 'timezone', in: 'query', schema: { type: 'string', default: 'Asia/Yerevan' } }],
    }) },
    '/api/bookings': {
      post: operation('Bookings', 'Create booking', bookingResponse, { status: 201, requestBody: body(object({ startTime: dateTime })), description: 'Copy a future startTime from availability. Capacity is 3 users per slot. Do not send userId, endTime or status.' }),
      get: operation('Bookings', 'Your bookings', paged('bookings', ref('Booking')), { parameters: [...page, { name: 'status', in: 'query', schema: { type: 'string', enum: ['SCHEDULED', 'CANCELLED', 'COMPLETED', 'MISSED'] } }] }),
    },
    '/api/bookings/{id}': { get: operation('Bookings', 'Your booking', bookingResponse, { parameters: [id] }) },
    '/api/bookings/{id}/cancel': { patch: operation('Bookings', 'Cancel upcoming booking', bookingResponse, { parameters: [id], description: 'Cannot cancel a started or session-linked booking. Repeated cancellation succeeds.' }) },
    '/api/sessions': {
      post: operation('Sessions', 'Start or resume booked session', sessionResponse, { requestBody: body(object({ bookingId: uuid })), description: 'Start during [booking.startTime, booking.endTime). Repeating while active returns the same session. Completed sessions cannot reopen.' }),
      get: operation('Sessions', 'Your sessions', paged('sessions', ref('Session')), { parameters: page }),
    },
    '/api/sessions/{id}': { get: operation('Sessions', 'Your session (persists expiry)', sessionResponse, { parameters: [id] }) },
    '/api/sessions/{id}/messages': {
      get: operation('Sessions', 'Conversation history', paged('messages', ref('Message')), { parameters: [id, ...page] }),
      post: operation('Sessions', 'Send message and receive Gemini reply', envelope({ userMessage: ref('Message'), assistantMessage: ref('Message') }), {
        status: 201, parameters: [id], requestBody: body(object({ content: { type: 'string', minLength: 1, maxLength: 4000, example: 'Այսօր մի փոքր անհանգիստ եմ։' } })),
        description: 'Active session required. Both messages persist atomically. Maximum 50 exchanges, 10 sends/minute. On 409 reload history; do not blindly resend after a lost HTTP response. Gemini key is configured only on the server.',
      }),
    },
    '/api/sessions/{id}/complete': { patch: operation('Sessions', 'End session and complete booking', sessionResponse, { parameters: [id] }) },
  },
};


const dateFilters = ['from', 'to'].map(name => ({ name, in: 'query', schema: dateTime, description: 'Inclusive creation timestamp boundary (ISO 8601 with offset).' }));
for (const [path, tag, name, fields, required] of [
  ['/api/moods', 'Moods', 'MoodEntry', { moodScore: { type: 'integer', minimum: 1, maximum: 5, example: 3 }, note: { type: 'string', maxLength: 2000, nullable: true } }, ['moodScore']],
  ['/api/journals', 'Journals', 'JournalEntry', { title: { type: 'string', minLength: 1, maxLength: 200, example: 'My day' }, content: { type: 'string', minLength: 1, maxLength: 6000, example: 'Today I took a relaxing walk.' } }, ['title', 'content']],
]) {
  openapi.components.schemas[name] = object({ id: uuid, ...fields, createdAt: dateTime, ...(tag === 'Journals' ? { updatedAt: dateTime } : {}) });
  openapi.paths[path] = {
    post: operation(tag, 'Create your entry', envelope({ entry: ref(name) }), { status: 201, requestBody: body(object(fields, required)) }),
    get: operation(tag, 'Your entries, newest first', paged('entries', ref(name)), { parameters: [...page, ...dateFilters] }),
  };
  openapi.paths[`${path}/{id}`] = {
    get: operation(tag, 'View your entry', envelope({ entry: ref(name) }), { parameters: [id] }),
    patch: operation(tag, 'Update your entry', envelope({ entry: ref(name) }), { parameters: [id], requestBody: body({ ...object(fields, []), minProperties: 1 }) }),
    delete: operation(tag, 'Delete your entry', null, { status: 204, parameters: [id], responses: { 204: { description: 'Entry deleted (empty body)' }, ...errors } }),
  };
}
