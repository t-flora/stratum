// sim.hpp: a small object-oriented particle simulation. This is the starting point to refactor.
#pragma once
#include <cmath>
#include <cstdint>
#include <memory>
#include <random>
#include <string>
#include <vector>

struct Vec2 {
    float x = 0, y = 0;
    Vec2& operator+=(Vec2 o) { x += o.x; y += o.y; return *this; }
};
inline Vec2 operator*(Vec2 v, float s) { return {v.x * s, v.y * s}; }

class Entity {
public:
    Entity(std::string name, Vec2 pos, Vec2 vel) : name_(std::move(name)), pos_(pos), vel_(vel) {}
    virtual ~Entity() = default;
    virtual void update(float dt) = 0;
    const std::string& name() const { return name_; }
    Vec2 position() const { return pos_; }
    bool alive() const { return alive_; }

protected:
    std::string name_;
    Vec2 pos_, vel_;
    float age_ = 0;
    bool alive_ = true;
};

constexpr float kGravity = -9.81f;
constexpr float kFloor = 0.0f;

class Projectile : public Entity {
public:
    using Entity::Entity;
    void update(float dt) override {
        vel_.y += kGravity * dt;
        pos_ += vel_ * dt;
        age_ += dt;
        if (pos_.y < kFloor) alive_ = false;
    }
};

class Bouncer : public Entity {
public:
    Bouncer(std::string name, Vec2 pos, Vec2 vel, float restitution)
        : Entity(std::move(name), pos, vel), restitution_(restitution) {}
    void update(float dt) override {
        vel_.y += kGravity * dt;
        pos_ += vel_ * dt;
        if (pos_.y < kFloor) { pos_.y = kFloor; vel_.y = -vel_.y * restitution_; }
        age_ += dt;
    }

private:
    float restitution_;
};

class Orbiter : public Entity {
public:
    Orbiter(std::string name, Vec2 centre, float radius, float omega)
        : Entity(std::move(name), centre, {}), centre_(centre), radius_(radius), omega_(omega) {}
    void update(float dt) override {
        angle_ += omega_ * dt;
        pos_ = {centre_.x + radius_ * std::cos(angle_), centre_.y + radius_ * std::sin(angle_)};
        age_ += dt;
    }

private:
    Vec2 centre_;
    float radius_, omega_, angle_ = 0;
};

class World {
public:
    explicit World(std::size_t n, std::uint64_t seed = 42) {
        std::mt19937_64 rng(seed);
        std::uniform_real_distribution<float> u(-1.0f, 1.0f);
        entities_.reserve(n);
        for (std::size_t i = 0; i < n; ++i) {
            Vec2 pos{u(rng) * 100, 50 + u(rng) * 50}, vel{u(rng) * 10, u(rng) * 10};
            std::string name = "e" + std::to_string(i);
            float radius = 5 + u(rng), omega = u(rng);
            switch (rng() % 3) {
                case 0: entities_.push_back(std::make_unique<Projectile>(name, pos, vel)); break;
                case 1: entities_.push_back(std::make_unique<Bouncer>(name, pos, vel, 0.8f)); break;
                default: entities_.push_back(std::make_unique<Orbiter>(name, pos, radius, omega));
            }
        }
    }

    void step(float dt) {
        for (auto& e : entities_)
            if (e->alive()) e->update(dt);
    }

    double checksum() const {
        double sum = 0;
        for (const auto& e : entities_)
            if (e->alive()) sum += static_cast<double>(e->position().x + e->position().y);
        return sum;
    }

    std::size_t size() const { return entities_.size(); }

private:
    std::vector<std::unique_ptr<Entity>> entities_;
};
