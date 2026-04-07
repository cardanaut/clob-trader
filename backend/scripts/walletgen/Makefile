# Makefile — walletgen (Ethereum vanity address generator)
# ─────────────────────────────────────────────────────────
# Usage:
#   make              → build ./walletgen
#   make clean        → remove build artifacts
#   make test         → quick sanity test (prefix "00")

CC      = gcc
CFLAGS  = -O3 -march=native -Wall -Wextra \
          -Wno-deprecated-declarations \
          -Wno-unused-parameter
LDFLAGS = -lcrypto -lpthread -lm
TARGET  = walletgen
SRC     = walletgen.c

# Detect OpenSSL location (handles Homebrew on macOS too)
UNAME := $(shell uname)
ifeq ($(UNAME), Darwin)
  OPENSSL_PREFIX := $(shell brew --prefix openssl 2>/dev/null || echo /usr/local)
  CFLAGS  += -I$(OPENSSL_PREFIX)/include
  LDFLAGS := -L$(OPENSSL_PREFIX)/lib $(LDFLAGS)
endif

.PHONY: all clean test

all: $(TARGET)

$(TARGET): $(SRC)
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)
	@echo ""
	@echo "  Built: ./$(TARGET)"
	@echo "  Usage: ./$(TARGET) [prefix] [threads]"
	@echo "  e.g.:  ./$(TARGET) 0000"
	@echo "         ./$(TARGET) 000000 16"
	@echo ""

clean:
	rm -f $(TARGET)

test: $(TARGET)
	@echo "  Running quick test (prefix '00', 2 threads)..."
	./$(TARGET) 00 2
