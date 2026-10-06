import ctypes, struct, os
libc = ctypes.CDLL(None, use_errno=True)
attr = bytearray(128); struct.pack_into("IIQQ", attr, 0, 0, 128, 1, 0)
struct.pack_into("Q", attr, 40, (1 << 5) | (1 << 6))
buf = ctypes.create_string_buffer(bytes(attr))
fd = libc.syscall(298, buf, 0, -1, -1, 0)
print("perf_event_open instructions:", fd, "" if fd >= 0 else os.strerror(ctypes.get_errno()))
if fd >= 0:
    s = sum(range(100000)); v = os.read(fd, 8); print("count", struct.unpack("Q", v)[0])
