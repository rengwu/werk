// Package texsandbox runs the compiler in a Windows AppContainer.
package texsandbox

import (
	"fmt"
	"html"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"unsafe"

	"golang.org/x/sys/windows"
)

var userenv = windows.NewLazySystemDLL("userenv.dll")

type capabilities struct {
	SID             *windows.SID
	Capabilities    uintptr
	Count, Reserved uint32
}

func copyFile(source, destination string) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, err = io.Copy(out, in)
	closed := out.Close()
	if err != nil {
		return err
	}
	return closed
}

func copyTree(source, destination string) error {
	return filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fmt.Errorf("sandbox inputs cannot contain links")
		}
		rel, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, rel)
		if entry.IsDir() {
			return os.MkdirAll(target, 0700)
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("sandbox input is not a regular file")
		}
		return copyFile(path, target)
	})
}

// Protect each tree from inherited application grants. Only the compiler SID,
// the current user and SYSTEM may access it. No ACL on original inputs changes.
func grantTree(path, sid, user, rights string) error {
	sd, err := windows.SecurityDescriptorFromString("D:P(A;OICI;FA;;;SY)(A;OICI;FA;;;" + user + ")(A;OICI;" + rights + ";;;" + sid + ")S:(ML;OICI;NW;;;LW)")
	if err != nil {
		return err
	}
	dacl, _, err := sd.DACL()
	if err != nil {
		return err
	}
	sacl, _, err := sd.SACL()
	if err != nil {
		return err
	}
	return windows.SetNamedSecurityInfo(path, windows.SE_FILE_OBJECT,
		windows.DACL_SECURITY_INFORMATION|windows.PROTECTED_DACL_SECURITY_INFORMATION|windows.LABEL_SECURITY_INFORMATION,
		nil, nil, dacl, sacl)
}

// Run uses private copies of the compiler/cache and grants no capabilities.
// A job attached atomically at CreateProcess prevents descendants and kills the
// compiler if this broker crashes or is terminated by the caller's deadline.
func Run(work, cache, binary string, args []string) (uint32, error) {
	root, err := os.MkdirTemp(work, ".sandbox-")
	if err != nil {
		return 0, err
	}
	defer os.RemoveAll(root)
	name, _ := windows.UTF16PtrFromString("werk.tex")
	var sid *windows.SID
	hr, _, _ := userenv.NewProc("CreateAppContainerProfile").Call(uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(name)), 0, 0, uintptr(unsafe.Pointer(&sid)))
	if uint32(hr) == 0x800700b7 { // ERROR_ALREADY_EXISTS
		hr, _, _ = userenv.NewProc("DeriveAppContainerSidFromAppContainerName").Call(uintptr(unsafe.Pointer(name)), uintptr(unsafe.Pointer(&sid)))
	}
	if int32(hr) < 0 {
		return 0, fmt.Errorf("derive sandbox identity: %x", hr)
	}
	defer windows.FreeSid(sid)
	owner, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		return 0, err
	}
	for _, name := range []string{"bin", "cache", "work"} {
		if err = os.Mkdir(filepath.Join(root, name), 0700); err != nil {
			return 0, err
		}
	}
	compiler := filepath.Join(root, "bin", "compiler.exe")
	if err = copyFile(binary, compiler); err != nil {
		return 0, err
	}
	if err = copyTree(cache, filepath.Join(root, "cache")); err != nil {
		return 0, err
	}
	if err = copyFile(filepath.Join(work, "resume.tex"), filepath.Join(root, "work", "resume.tex")); err != nil {
		return 0, err
	}
	if err = os.Mkdir(filepath.Join(root, "work", "out"), 0700); err != nil {
		return 0, err
	}
	for _, folder := range []string{"AppData/Local/Packages/werk.tex/AC/Temp", "AppData/Roaming"} {
		if err = os.MkdirAll(filepath.Join(root, "work", folder), 0700); err != nil {
			return 0, err
		}
	}
	for _, folder := range []string{"fonts", "font-cache"} {
		if err = os.Mkdir(filepath.Join(root, "work", folder), 0700); err != nil {
			return 0, err
		}
	}
	fontconfig := "<fontconfig><dir>" + html.EscapeString(filepath.ToSlash(filepath.Join(root, "work", "fonts"))) + "</dir><cachedir>" + html.EscapeString(filepath.ToSlash(filepath.Join(root, "work", "font-cache"))) + "</cachedir></fontconfig>"
	if err = os.WriteFile(filepath.Join(root, "work", "fonts.conf"), []byte(fontconfig), 0600); err != nil {
		return 0, err
	}
	for _, item := range []struct{ path, rights string }{{root, "GRGX"}, {filepath.Join(root, "bin"), "GRGX"}, {filepath.Join(root, "cache"), "GR"}, {filepath.Join(root, "work"), "0x1301bf"}} {
		if err = grantTree(item.path, sid.String(), owner.User.Sid.String(), item.rights); err != nil {
			return 0, fmt.Errorf("grant sandbox input: %w", err)
		}
	}
	job, err := windows.CreateJobObject(nil, nil)
	if err != nil {
		return 0, err
	}
	defer windows.CloseHandle(job)
	limits := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{}
	limits.BasicLimitInformation.LimitFlags = windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | windows.JOB_OBJECT_LIMIT_ACTIVE_PROCESS
	limits.BasicLimitInformation.ActiveProcessLimit = 1
	if _, err = windows.SetInformationJobObject(job, windows.JobObjectExtendedLimitInformation, uintptr(unsafe.Pointer(&limits)), uint32(unsafe.Sizeof(limits))); err != nil {
		return 0, err
	}
	attrs, err := windows.NewProcThreadAttributeList(3)
	if err != nil {
		return 0, err
	}
	defer attrs.Delete()
	caps := capabilities{SID: sid}
	if err = attrs.Update(0x20009, unsafe.Pointer(&caps), unsafe.Sizeof(caps)); err != nil {
		return 0, err
	}
	if err = attrs.Update(0x2000d, unsafe.Pointer(&job), unsafe.Sizeof(job)); err != nil {
		return 0, err
	}
	var handles [3]windows.Handle
	for i, f := range []*os.File{os.Stdin, os.Stdout, os.Stderr} {
		if err = windows.DuplicateHandle(windows.CurrentProcess(), windows.Handle(f.Fd()), windows.CurrentProcess(), &handles[i], 0, true, windows.DUPLICATE_SAME_ACCESS); err != nil {
			return 0, err
		}
		defer windows.CloseHandle(handles[i])
	}
	if err = attrs.Update(windows.PROC_THREAD_ATTRIBUTE_HANDLE_LIST, unsafe.Pointer(&handles[0]), unsafe.Sizeof(handles)); err != nil {
		return 0, err
	}
	startup := windows.StartupInfoEx{ProcThreadAttributeList: attrs.List()}
	startup.Cb = uint32(unsafe.Sizeof(startup))
	startup.Flags = windows.STARTF_USESTDHANDLES
	startup.StdInput, startup.StdOutput, startup.StdErr = handles[0], handles[1], handles[2]
	working := filepath.Join(root, "work")
	env := []string{"SystemRoot=" + os.Getenv("SystemRoot"), "WINDIR=" + os.Getenv("SystemRoot"), "TEMP=" + working, "TMP=" + working, "HOME=" + working, "USERPROFILE=" + working, "LOCALAPPDATA=" + filepath.Join(working, "AppData", "Local"), "APPDATA=" + filepath.Join(working, "AppData", "Roaming"), "TECTONIC_CACHE_DIR=" + filepath.Join(root, "cache"), "XDG_CACHE_HOME=" + filepath.Join(root, "cache"), "TECTONIC_UNTRUSTED_MODE=1", "SOURCE_DATE_EPOCH=1789920000", "LANG=en_US.UTF-8"}
	var block []uint16
	env = append(env, "FONTCONFIG_FILE="+filepath.Join(working, "fonts.conf"))
	for _, entry := range env {
		value, e := windows.UTF16FromString(entry)
		if e != nil {
			return 0, e
		}
		block = append(block, value...)
	}
	block = append(block, 0)
	command, err := windows.UTF16PtrFromString(windows.ComposeCommandLine(append([]string{compiler}, args...)))
	if err != nil {
		return 0, err
	}
	dir, _ := windows.UTF16PtrFromString(working)
	app, _ := windows.UTF16PtrFromString(compiler)
	var process windows.ProcessInformation
	if err = windows.CreateProcess(app, command, nil, nil, true, windows.EXTENDED_STARTUPINFO_PRESENT|windows.CREATE_UNICODE_ENVIRONMENT|windows.CREATE_NO_WINDOW, &block[0], dir, &startup.StartupInfo, &process); err != nil {
		return 0, fmt.Errorf("create AppContainer: %w", err)
	}
	defer windows.CloseHandle(process.Process)
	windows.CloseHandle(process.Thread)
	if _, err = windows.WaitForSingleObject(process.Process, windows.INFINITE); err != nil {
		return 0, err
	}
	var code uint32
	if err = windows.GetExitCodeProcess(process.Process, &code); err != nil {
		return 0, err
	}
	runtime.KeepAlive(caps)
	if code == 0 {
		// Only the expected PDF crosses the boundary; never follow compiler links.
		pdf := filepath.Join(working, "out", "resume.pdf")
		info, err := os.Lstat(pdf)
		if err != nil {
			return 0, err
		}
		if !info.Mode().IsRegular() || info.Size() > 8*1024*1024 {
			return 0, fmt.Errorf("invalid sandbox PDF")
		}
		if err = copyFile(pdf, filepath.Join(work, "out", "resume.pdf")); err != nil {
			return 0, err
		}
	}
	return code, nil
}
