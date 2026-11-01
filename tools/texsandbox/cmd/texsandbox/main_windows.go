package main

import (
	"fmt"
	"os"
	"werk/texsandbox/internal/texsandbox"
)

func main() {
	if len(os.Args) < 5 {
		fmt.Fprintln(os.Stderr, "Windows LaTeX sandbox: expected work cache compiler arguments")
		os.Exit(1)
	}
	code, err := texsandbox.Run(os.Args[1], os.Args[2], os.Args[3], os.Args[4:])
	if err != nil {
		fmt.Fprintln(os.Stderr, "Windows LaTeX sandbox:", err)
		os.Exit(1)
	}
	os.Exit(int(code))
}
