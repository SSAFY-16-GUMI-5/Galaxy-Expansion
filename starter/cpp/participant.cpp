// Galaxy Expansion C++ participant starter (C++17, standard library only).
//
// The bridge (node bridge/local-bridge.mjs -- <this program>) talks to this
// program over JSON Lines:
//   stdin  <- {"type":"init",...}, then one {"type":"ack",...} or
//             {"type":"error",...} reply per event we send
//   stdout -> exactly one JSON event per line (acquire / release / reset)
//   stderr -> human-readable logs only (never write logs to stdout)
//
// This sample shows the full slot lifecycle on ONE pool slot:
//   reset -> acquire (generation 1) -> release (generation 1)
//         -> acquire (generation 2, same slot, same C++ object instance)
//
// Replace StarPool with your own object pool. Keep the identity check: the
// viewer only counts slot/generation numbers, so your own code must prove that
// the second acquire really reused the same instance.

#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

// ---------------------------------------------------------------------------
// Minimal JSON helpers (no external library).
// Outgoing events are built with escaped strings. Incoming bridge messages
// are flat objects such as {"type":"ack","revision":3,"action":"acquire"},
// so a small top-level field reader is enough for this protocol.
// ---------------------------------------------------------------------------

std::string jsonString(const std::string& value) {
    std::string out = "\"";
    for (unsigned char c : value) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if (c < 0x20) {
                    char buf[8];
                    std::snprintf(buf, sizeof buf, "\\u%04x", c);
                    out += buf;
                } else {
                    out += static_cast<char>(c);
                }
        }
    }
    return out + "\"";
}

// Returns the raw value of a top-level field: string contents (unescaped) or
// the literal text of a number/boolean. Returns "" when the field is absent.
std::string readField(const std::string& json, const std::string& key) {
    const std::string needle = "\"" + key + "\"";
    int depth = 0;
    bool inString = false;
    bool expectKey = false;  // true right after '{' or ',' at the top level
    for (size_t i = 0; i < json.size(); ++i) {
        char c = json[i];
        if (inString) {
            if (c == '\\') ++i;
            else if (c == '"') inString = false;
            continue;
        }
        if (c == '{' || c == '[') { ++depth; expectKey = (depth == 1); continue; }
        if (c == '}' || c == ']') { --depth; continue; }
        if (c == ',' && depth == 1) { expectKey = true; continue; }
        if (c != '"') continue;
        const bool isKey = expectKey && depth == 1;
        expectKey = false;
        if (isKey && json.compare(i, needle.size(), needle) == 0) {
            size_t p = json.find(':', i + needle.size());
            if (p == std::string::npos) return "";
            ++p;
            while (p < json.size() && (json[p] == ' ' || json[p] == '\t')) ++p;
            if (p < json.size() && json[p] == '"') {
                std::string value;
                for (++p; p < json.size() && json[p] != '"'; ++p) {
                    if (json[p] == '\\' && p + 1 < json.size()) {
                        char e = json[++p];
                        value += (e == 'n') ? '\n' : (e == 't') ? '\t' : e;
                    } else {
                        value += json[p];
                    }
                }
                return value;
            }
            size_t end = json.find_first_of(",}", p);
            return json.substr(p, end - p);
        }
        inString = true;  // skip over a key or string value we don't need
    }
    return "";
}

// ---------------------------------------------------------------------------
// Bridge session: send one event, then wait for its ack/error on stdin.
// ---------------------------------------------------------------------------

class Session {
public:
    std::string participantId;

    void open() {
        std::string init = readLine();
        if (readField(init, "type") != "init")
            throw std::runtime_error("expected init message from bridge, got: " + init);
        participantId = readField(init, "participantId");
    }

    // Writes one JSONL event and blocks until the relay answers it.
    // Returns the ack revision; throws on an error reply.
    long send(const std::string& action, const std::string& eventJson) {
        std::cout << eventJson << '\n' << std::flush;
        std::string reply = readLine();
        std::string type = readField(reply, "type");
        if (type == "error")
            throw std::runtime_error("relay rejected " + action + ": " + readField(reply, "message"));
        if (type != "ack" || readField(reply, "action") != action)
            throw std::runtime_error("expected ack for " + action + ", got: " + reply);
        long revision = std::strtol(readField(reply, "revision").c_str(), nullptr, 10);
        std::cerr << "[ack] " << action << " - revision " << revision << '\n';
        return revision;
    }

private:
    static std::string readLine() {
        std::string line;
        if (!std::getline(std::cin, line))
            throw std::runtime_error("bridge closed stdin");
        if (!line.empty() && line.back() == '\r') line.pop_back();
        return line;
    }
};

// ---------------------------------------------------------------------------
// Example object pool. Each Star owns a fixed poolSlotId; every acquire of a
// recycled instance increments its generation, exactly as the relay expects.
// ---------------------------------------------------------------------------

struct Star {
    std::string poolSlotId;
    int generation = 0;  // 0 = never acquired
    bool active = false;
    std::string name;
    std::string type = "star";  // seed | star | planet
    std::string color = "#5dcaff";  // #RRGGBB
    double size = 1.2;  // 0.3 .. 3.5
};

class StarPool {
public:
    Star* acquire() {
        Star* star = nullptr;
        if (!free_.empty()) {
            star = free_.back();  // reuse a returned instance
            free_.pop_back();
        } else {
            owned_.push_back(std::make_unique<Star>());
            star = owned_.back().get();
            star->poolSlotId = std::to_string(owned_.size());
        }
        star->generation += 1;
        star->active = true;
        return star;
    }

    void release(Star* star) {
        star->active = false;
        free_.push_back(star);
    }

    size_t createdCount() const { return owned_.size(); }

private:
    std::vector<std::unique_ptr<Star>> owned_;  // the pool owns every instance
    std::vector<Star*> free_;
};

std::string acquireEvent(const Star& s) {
    char size[32];
    std::snprintf(size, sizeof size, "%.2f", s.size);
    return std::string("{\"type\":\"acquire\",\"poolSlotId\":") + jsonString(s.poolSlotId) +
           ",\"generation\":" + std::to_string(s.generation) +
           ",\"data\":{\"name\":" + jsonString(s.name) + ",\"type\":" + jsonString(s.type) +
           ",\"color\":" + jsonString(s.color) + ",\"size\":" + size + "}}";
}

std::string releaseEvent(const Star& s) {
    return std::string("{\"type\":\"release\",\"poolSlotId\":") + jsonString(s.poolSlotId) +
           ",\"generation\":" + std::to_string(s.generation) + "}";
}

int main() {
#ifdef _WIN32
    // Keep stdout as plain "\n" JSONL (no CRLF translation on Windows).
    _setmode(_fileno(stdout), _O_BINARY);
#endif
    try {
        Session session;
        session.open();
        std::cerr << "connected as " << session.participantId << '\n';

        StarPool pool;
        session.send("reset", "{\"type\":\"reset\"}");  // clear only my slots

        // 1) First acquire: a brand-new instance, generation 1.
        Star* first = pool.acquire();
        first->name = "Cpp Star";
        first->color = "#ffb347";
        first->size = 1.4;
        session.send("acquire", acquireEvent(*first));

        // 2) Release it back to the pool with the same generation.
        session.send("release", releaseEvent(*first));
        pool.release(first);

        // 3) Acquire again: the pool must hand back the SAME instance.
        Star* second = pool.acquire();
        second->name = "Cpp Star (reused)";
        second->color = "#7cffb2";
        second->size = 1.8;

        const bool sameInstance = (second == first);
        std::cerr << "[pool] slot " << second->poolSlotId << " generation " << second->generation
                  << ", same instance: " << (sameInstance ? "yes" : "no")
                  << ", instances created: " << pool.createdCount() << '\n';
        if (!sameInstance || second->generation != 2 || pool.createdCount() != 1)
            throw std::runtime_error("object pool did not reuse the released instance");

        session.send("acquire", acquireEvent(*second));
        std::cerr << "done: slot " << second->poolSlotId << " is active at generation "
                  << second->generation << '\n';
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "[error] " << e.what() << '\n';
        return 1;
    }
}
