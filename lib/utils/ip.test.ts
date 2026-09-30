import { describe, expect, it } from "vitest";
import { ipBucket } from "./ip";

describe("ipBucket", () => {
  it("IPv6 는 같은 /64 면 같은 키", () => {
    expect(ipBucket("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(ipBucket("2001:0db8:0001:0002:ffff:1:2:3")).toBe("2001:db8:1:2::/64");
    expect(ipBucket("[2001:DB8:1:2::9]")).toBe("2001:db8:1:2::/64");
    expect(ipBucket("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
  });
  it("다른 /64 는 다른 키", () => {
    expect(ipBucket("2001:db8:1:3::1")).not.toBe(ipBucket("2001:db8:1:2::1"));
  });
  it("IPv4·mapped 는 그대로", () => {
    expect(ipBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(ipBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });
  it("이상한 값은 원문(소문자)", () => {
    expect(ipBucket("unknown")).toBe("unknown");
    expect(ipBucket("1:2:3")).toBe("1:2:3");
  });
});
