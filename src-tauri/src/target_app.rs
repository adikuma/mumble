//! best effort capture of the foreground window at paste time.
//!
//! returns the exe display name and its full path. the name populates the
//! `target_app` column so insights can show "where you pasted", the path lets
//! the frontend extract the real app icon. returns `None` on any failure and
//! never blocks transcription on this.

#[cfg(windows)]
pub fn current_foreground_app() -> Option<(String, String)> {
    use windows::Win32::Foundation::{CloseHandle, MAX_PATH};
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }

        let mut pid: u32 = 0;
        let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 {
            return None;
        }

        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;

        let mut buf = vec![0u16; MAX_PATH as usize];
        let mut size = buf.len() as u32;
        let result = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut size,
        );
        let _ = CloseHandle(handle);

        if result.is_err() {
            return None;
        }

        let path = String::from_utf16_lossy(&buf[..size as usize]);
        // strip the directory for the display name. "C:\Windows\notepad.exe"
        // becomes "notepad.exe". keep the full path for icon extraction.
        let exe = std::path::Path::new(&path)
            .file_name()
            .map(|s| s.to_string_lossy().to_string())?;
        if exe.is_empty() {
            None
        } else {
            Some((exe, path))
        }
    }
}

#[cfg(not(windows))]
pub fn current_foreground_app() -> Option<(String, String)> {
    None
}
