package texsandbox

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"golang.org/x/sys/windows"
)

func TestMain(m *testing.M) {
	if len(os.Args) > 1 && os.Args[1] == "probe" {
		if os.Args[2] == "sleep" {
			fmt.Println(os.Getpid())
			time.Sleep(time.Minute)
			os.Exit(9)
		}
		private, canonical := os.Args[2], os.Args[3]
		_, read := os.ReadFile(private)
		write := os.WriteFile(private, []byte("changed"), 0600)
		_, original := os.ReadFile(canonical)
		cacheWrite := os.WriteFile(filepath.Join("..", "cache", "generic.txt"), []byte("changed"), 0600)
		conn, network := net.DialTimeout("tcp", os.Args[4], time.Second)
		if conn != nil {
			conn.Close()
		}
		self, _ := os.Executable()
		child := exec.Command(self, "probe", "sleep")
		spawn := child.Start()
		if spawn == nil {
			child.Process.Kill()
			child.Wait()
		}
		results := map[string]bool{"privateReadDenied": os.IsPermission(read), "privateWriteDenied": os.IsPermission(write), "originalCacheDenied": os.IsPermission(original), "cacheWriteDenied": os.IsPermission(cacheWrite), "networkDenied": network != nil, "childDenied": spawn != nil}
		bytes, _ := json.Marshal(results)
		if err := os.WriteFile(filepath.Join("out", "resume.pdf"), bytes, 0600); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(2)
		}
		os.Exit(0)
	}
	if len(os.Args) > 1 && os.Args[1] == "broker" {
		code, err := Run(os.Args[2], os.Args[3], os.Args[4], []string{"probe", "sleep"})
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
		os.Exit(int(code))
	}
	os.Exit(m.Run())
}

func inputs(t *testing.T) (string, string, string) {
	t.Helper()
	root := t.TempDir()
	work := filepath.Join(root, "work")
	cache := filepath.Join(root, "cache")
	for _, p := range []string{work, filepath.Join(work, "out"), cache} {
		if err := os.Mkdir(p, 0700); err != nil {
			t.Fatal(err)
		}
	}
	for p, body := range map[string]string{filepath.Join(work, "resume.tex"): "fixture", filepath.Join(cache, "generic.txt"): "generic", filepath.Join(root, "private.txt"): "private fixture"} {
		if err := os.WriteFile(p, []byte(body), 0600); err != nil {
			t.Fatal(err)
		}
	}
	return root, work, cache
}

func TestAppContainerBoundaries(t *testing.T) {
	root, work, cache := inputs(t)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	self, _ := os.Executable()
	code, err := Run(work, cache, self, []string{"probe", filepath.Join(root, "private.txt"), filepath.Join(cache, "generic.txt"), listener.Addr().String()})
	if err != nil || code != 0 {
		t.Fatalf("sandbox: %d %v", code, err)
	}
	bytes, err := os.ReadFile(filepath.Join(work, "out", "resume.pdf"))
	if err != nil {
		t.Fatal(err)
	}
	var results map[string]bool
	if err = json.Unmarshal(bytes, &results); err != nil {
		t.Fatal(err)
	}
	if len(results) != 6 {
		t.Fatal(string(bytes))
	}
	for boundary, denied := range results {
		if !denied {
			t.Errorf("sandbox allowed %s", boundary)
		}
	}
	for p, expected := range map[string]string{filepath.Join(root, "private.txt"): "private fixture", filepath.Join(cache, "generic.txt"): "generic"} {
		data, _ := os.ReadFile(p)
		if string(data) != expected {
			t.Errorf("changed original %s", p)
		}
	}
}

func TestBrokerDeathReapsCompiler(t *testing.T) {
	_, work, cache := inputs(t)
	self, _ := os.Executable()
	broker := exec.Command(self, "broker", work, cache, self)
	stdout, err := broker.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	broker.Stderr = os.Stderr
	if err = broker.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { broker.Process.Kill(); broker.Wait() }()
	lines := make(chan string, 1)
	go func() { reader := bufio.NewReader(stdout); line, _ := reader.ReadString('\n'); lines <- line }()
	var line string
	select {
	case line = <-lines:
	case <-time.After(20 * time.Second):
		t.Fatal("compiler did not start")
	}
	pid, err := strconv.Atoi(strings.TrimSpace(line))
	if err != nil {
		t.Fatalf("compiler pid: %q", line)
	}
	handle, err := windows.OpenProcess(windows.SYNCHRONIZE, false, uint32(pid))
	if err != nil {
		t.Fatal(err)
	}
	defer windows.CloseHandle(handle)
	if err = broker.Process.Kill(); err != nil {
		t.Fatal(err)
	}
	result, err := windows.WaitForSingleObject(handle, 5000)
	if err != nil || result != windows.WAIT_OBJECT_0 {
		t.Fatalf("orphaned compiler %d: %d %v", pid, result, err)
	}
}
