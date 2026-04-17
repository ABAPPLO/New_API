package relay

import (
	"bufio"
	"bytes"
	"net"
	"net/http"

	"github.com/gin-gonic/gin"
)

type BufferResponseWriter struct {
	gin.ResponseWriter
	buffer     bytes.Buffer
	statusCode int
	headers    http.Header
	written    bool
}

func NewBufferResponseWriter(original gin.ResponseWriter) *BufferResponseWriter {
	return &BufferResponseWriter{
		ResponseWriter: original,
		headers:        make(http.Header),
	}
}

func (w *BufferResponseWriter) Write(data []byte) (int, error) {
	w.written = true
	return w.buffer.Write(data)
}

func (w *BufferResponseWriter) WriteHeader(code int) {
	w.statusCode = code
}

func (w *BufferResponseWriter) Header() http.Header {
	return w.headers
}

func (w *BufferResponseWriter) WriteHeaderNow() {}

func (w *BufferResponseWriter) Status() int {
	if w.statusCode == 0 {
		return http.StatusOK
	}
	return w.statusCode
}

func (w *BufferResponseWriter) Size() int {
	return w.buffer.Len()
}

func (w *BufferResponseWriter) Written() bool {
	return w.written
}

func (w *BufferResponseWriter) GetData() []byte {
	return w.buffer.Bytes()
}

func (w *BufferResponseWriter) GetStatusCode() int {
	if w.statusCode == 0 {
		return http.StatusOK
	}
	return w.statusCode
}

func (w *BufferResponseWriter) GetContentType() string {
	ct := w.headers.Get("Content-Type")
	if ct == "" {
		ct = w.ResponseWriter.Header().Get("Content-Type")
	}
	return ct
}

func (w *BufferResponseWriter) Flush() {}

func (w *BufferResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	return w.ResponseWriter.Hijack()
}
