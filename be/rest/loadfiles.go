package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// loadFilesDir is where the original vendor files are kept, if this process can see them: the
// SFTP drop box's processed folder, which holds one subfolder per day (deploy/SFTP.md). Empty
// means no originals, and every download answers 404.
var loadFilesDir = os.Getenv("LOAD_FILES_DIR")

// serveLoadFile answers GET and HEAD /api/loads/files/{id}/download for the load_files row with
// this source_file and sha256. It serves the file of that name under loadFilesDir whose SHA-256
// is the recorded one, so the download is byte for byte what the loader read; a file sent again
// under the same name with other contents is not it. A row without a hash (the loader could not
// read the file) has nothing to verify against and is never served.
func serveLoadFile(w http.ResponseWriter, r *http.Request, name, sum string) {
	path := findLoadFile(name, sum)
	if path == "" {
		http.Error(w, "the original file is not on the server", http.StatusNotFound)
		return
	}
	f, err := os.Open(path)
	if err != nil {
		serverError(w, err)
		return
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		serverError(w, err)
		return
	}
	if r.Method == http.MethodGet {
		// The extracts hold lessee personal data, so say who took a copy.
		u, _ := r.Context().Value(userKey{}).(User)
		log.Printf("load file download: %s (sha256 %s) by %s", name, sum, u.Email)
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", name))
	http.ServeContent(w, r, "", info.ModTime(), f)
}

// findLoadFile returns the path of the file called name, in loadFilesDir or one of its
// subfolders, whose SHA-256 is sum; "" if there is none.
func findLoadFile(name, sum string) string {
	// name comes from load_files.source_file, a base name; anything else is not looked up.
	if loadFilesDir == "" || sum == "" || name == "" || name != filepath.Base(name) || strings.ContainsAny(name, `*?[\`) {
		return ""
	}
	paths, _ := filepath.Glob(filepath.Join(loadFilesDir, "*", name))
	for _, p := range append(paths, filepath.Join(loadFilesDir, name)) {
		if got, err := fileSHA256(p); err == nil && got == sum {
			return p
		}
	}
	return ""
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
