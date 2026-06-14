// Package nats wraps the nats.go client with retry logic.
package nats

import (
	"log"
	"time"

	natsgo "github.com/nats-io/nats.go"
)

// Connect returns a connected *nats.Conn with exponential back-off retry.
func Connect(url string) (*natsgo.Conn, error) {
	opts := []natsgo.Option{
		natsgo.RetryOnFailedConnect(true),
		natsgo.MaxReconnects(10),
		natsgo.ReconnectWait(2 * time.Second),
		natsgo.DisconnectErrHandler(func(_ *natsgo.Conn, err error) {
			log.Printf("[nats] disconnected: %v", err)
		}),
		natsgo.ReconnectHandler(func(_ *natsgo.Conn) {
			log.Println("[nats] reconnected")
		}),
	}
	return natsgo.Connect(url, opts...)
}
