// extracts platform icons for executable paths and caches them in memory.
// returns a data url string the frontend can use directly as an img src.
// on non-windows builds the cache always returns None (stub).

use base64::Engine as _;
use std::collections::HashMap;
use std::sync::Mutex;

pub struct IconCache {
    inner: Mutex<HashMap<String, Option<String>>>,
}

impl IconCache {
    pub fn new() -> Self {
        Self { inner: Mutex::new(HashMap::new()) }
    }

    // returns Some data url on first successful extraction or a cache hit.
    // returns None when extraction has failed before or fails now.
    // never panics.
    pub fn get_or_extract(&self, exe_path: &str) -> Option<String> {
        if let Some(hit) = self.inner.lock().ok().and_then(|g| g.get(exe_path).cloned()) {
            return hit;
        }
        let extracted = extract_icon(exe_path);
        if let Ok(mut g) = self.inner.lock() {
            g.insert(exe_path.to_string(), extracted.clone());
        }
        extracted
    }
}

#[cfg(windows)]
fn extract_icon(exe_path: &str) -> Option<String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::Win32::Graphics::Gdi::{
        BITMAP, BITMAPINFO, BITMAPINFOHEADER, CreateCompatibleDC, DeleteDC,
        DeleteObject, DIB_RGB_COLORS, GetDIBits, GetObjectW, SelectObject,
    };
    use windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_NORMAL;
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_SMALLICON};
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, ICONINFO};
    use windows::core::PCWSTR;

    // encode path as null-terminated utf-16
    let wide: Vec<u16> = OsStr::new(exe_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let mut shfi = SHFILEINFOW::default();
        let flags = SHGFI_ICON | SHGFI_SMALLICON;
        let result = SHGetFileInfoW(
            PCWSTR(wide.as_ptr()),
            FILE_ATTRIBUTE_NORMAL,
            Some(&mut shfi),
            std::mem::size_of::<SHFILEINFOW>() as u32,
            flags,
        );
        if result == 0 || shfi.hIcon.is_invalid() {
            return None;
        }

        // read icon bitmap info
        let mut icon_info = ICONINFO::default();
        if GetIconInfo(shfi.hIcon, &mut icon_info).is_err() {
            let _ = DestroyIcon(shfi.hIcon);
            return None;
        }

        // query bitmap dimensions
        let mut bm = BITMAP::default();
        let got = GetObjectW(
            icon_info.hbmColor,
            std::mem::size_of::<BITMAP>() as i32,
            Some(&mut bm as *mut BITMAP as *mut _),
        );
        if got == 0 {
            let _ = DeleteObject(icon_info.hbmColor);
            let _ = DeleteObject(icon_info.hbmMask);
            let _ = DestroyIcon(shfi.hIcon);
            return None;
        }

        let width = bm.bmWidth as u32;
        let height = bm.bmHeight as u32;
        let stride = width * 4;

        // read raw bgra pixels via GetDIBits
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width as i32,
                biHeight: -(height as i32),  // top-down dib
                biPlanes: 1,
                biBitCount: 32,
                biCompression: 0,  // BI_RGB
                ..Default::default()
            },
            ..Default::default()
        };

        let mut pixels = vec![0u8; (stride * height) as usize];
        let dc = CreateCompatibleDC(None);
        let old_obj = SelectObject(dc, icon_info.hbmColor);

        let rows = GetDIBits(
            dc,
            icon_info.hbmColor,
            0,
            height,
            Some(pixels.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(dc, old_obj);
        let _ = DeleteDC(dc);
        let _ = DeleteObject(icon_info.hbmColor);
        let _ = DeleteObject(icon_info.hbmMask);
        let _ = DestroyIcon(shfi.hIcon);

        if rows == 0 {
            return None;
        }

        // windows returns bgra, convert to rgba for png encoding
        for chunk in pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2);
        }

        let png_bytes = encode_rgba_to_png(width, height, &pixels);
        let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
        Some(format!("data:image/png;base64,{}", b64))
    }
}

#[cfg(windows)]
fn encode_rgba_to_png(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
    let mut out: Vec<u8> = Vec::new();
    // png signature
    out.extend_from_slice(b"\x89PNG\r\n\x1a\n");

    let write_chunk = |out: &mut Vec<u8>, tag: &[u8; 4], data: &[u8]| {
        out.extend_from_slice(&(data.len() as u32).to_be_bytes());
        out.extend_from_slice(tag);
        out.extend_from_slice(data);
        let crc = crc32(tag, data);
        out.extend_from_slice(&crc.to_be_bytes());
    };

    // ihdr: width, height, 8-bit depth, rgba color type 6
    let mut ihdr = Vec::with_capacity(13);
    ihdr.extend_from_slice(&width.to_be_bytes());
    ihdr.extend_from_slice(&height.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);
    write_chunk(&mut out, b"IHDR", &ihdr);

    // idat: prepend a none-filter byte per row, then zlib-deflate
    let stride = width as usize * 4;
    let mut raw = Vec::with_capacity(height as usize * (stride + 1));
    for row in 0..height as usize {
        raw.push(0);
        raw.extend_from_slice(&rgba[row * stride..(row + 1) * stride]);
    }
    let compressed = miniz_oxide::deflate::compress_to_vec_zlib(&raw, 6);
    write_chunk(&mut out, b"IDAT", &compressed);

    write_chunk(&mut out, b"IEND", b"");
    out
}

#[cfg(windows)]
fn crc32(tag: &[u8; 4], data: &[u8]) -> u32 {
    static TABLE: std::sync::OnceLock<[u32; 256]> = std::sync::OnceLock::new();
    let table = TABLE.get_or_init(|| {
        let mut t = [0u32; 256];
        for (i, entry) in t.iter_mut().enumerate() {
            let mut c = i as u32;
            for _ in 0..8 {
                c = if c & 1 != 0 { 0xedb88320 ^ (c >> 1) } else { c >> 1 };
            }
            *entry = c;
        }
        t
    });
    let mut crc = 0xffffffff_u32;
    for &b in tag.iter().chain(data.iter()) {
        crc = table[((crc ^ b as u32) & 0xff) as usize] ^ (crc >> 8);
    }
    crc ^ 0xffffffff
}

#[cfg(not(windows))]
fn extract_icon(_exe_path: &str) -> Option<String> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(windows)]
    fn extracts_notepad_icon() {
        let cache = IconCache::new();
        let icon = cache.get_or_extract(r"C:\Windows\System32\notepad.exe");
        assert!(icon.is_some(), "notepad icon should extract");
        let url = icon.unwrap();
        assert!(url.starts_with("data:image/png;base64,"));
        let icon2 = cache.get_or_extract(r"C:\Windows\System32\notepad.exe");
        assert_eq!(Some(url), icon2);
    }

    #[test]
    fn caches_failure() {
        let cache = IconCache::new();
        let bad = cache.get_or_extract(r"C:\definitely\not\a\file.exe");
        assert!(bad.is_none());
    }
}
