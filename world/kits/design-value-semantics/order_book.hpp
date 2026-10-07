// order_book.hpp: a small limit order book. This is the API to redesign.
#pragma once
#include <algorithm>
#include <cstdint>
#include <iterator>
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

enum class Side { Buy, Sell };

class OrderBook;

class Order {
public:
    Order(Side side, double price, int qty, std::string trader)
        : id_(next_id()), side_(side), price_(price), qty_(qty), trader_(std::move(trader)) {}
    Order(const Order&) = delete;
    Order& operator=(const Order&) = delete;

    std::uint64_t id() const { return id_; }
    Side side() const { return side_; }
    double& price() { return price_; }
    int& qty() { return qty_; }
    const std::string& trader() const { return trader_; }
    OrderBook* book() const { return book_; }
    bool operator==(const Order& other) const { return this == &other; }

private:
    friend class OrderBook;
    static std::uint64_t next_id() { static std::uint64_t n = 0; return ++n; }
    std::uint64_t id_;
    Side side_;
    double price_;
    int qty_;
    std::string trader_;
    OrderBook* book_ = nullptr;
};

class BookListener {
public:
    virtual ~BookListener() = default;
    virtual void on_fill(Order& resting, Order& incoming, int qty) = 0;
    virtual void on_change(OrderBook&) {}
};

class OrderBook {
public:
    using Level = std::vector<std::shared_ptr<Order>>;

    void subscribe(BookListener* listener) { listeners_.push_back(listener); }

    std::shared_ptr<Order> submit(Side side, double price, int qty, const std::string& trader) {
        auto order = std::make_shared<Order>(side, price, qty, trader);
        order->book_ = this;
        match(*order);
        if (order->qty_ > 0) levels(side)[price].push_back(order);
        else order->book_ = nullptr;
        for (auto* listener : listeners_) listener->on_change(*this);
        return order;
    }

    bool cancel(const std::shared_ptr<Order>& order) {
        auto& side = levels(order->side_);
        auto it = side.find(order->price_);
        if (it == side.end()) return false;
        auto pos = std::find(it->second.begin(), it->second.end(), order);
        if (pos == it->second.end()) return false;
        it->second.erase(pos);
        if (it->second.empty()) side.erase(it);
        order->book_ = nullptr;
        for (auto* listener : listeners_) listener->on_change(*this);
        return true;
    }

    bool best(Side side, std::shared_ptr<Order>& out) const {
        const auto& book = side == Side::Buy ? bids_ : asks_;
        if (book.empty()) return false;
        out = (side == Side::Buy ? std::prev(book.end()) : book.begin())->second.front();
        return true;
    }

    std::map<double, Level>& levels(Side side) { return side == Side::Buy ? bids_ : asks_; }

private:
    void match(Order& in) {
        auto& opposite = levels(in.side_ == Side::Buy ? Side::Sell : Side::Buy);
        while (in.qty_ > 0 && !opposite.empty()) {
            auto it = in.side_ == Side::Buy ? opposite.begin() : std::prev(opposite.end());
            if (in.side_ == Side::Buy ? it->first > in.price_ : it->first < in.price_) break;
            Order& resting = *it->second.front();
            int qty = std::min(in.qty_, resting.qty_);
            in.qty_ -= qty;
            resting.qty_ -= qty;
            for (auto* listener : listeners_) listener->on_fill(resting, in, qty);
            if (resting.qty_ == 0) { resting.book_ = nullptr; it->second.erase(it->second.begin()); }
            if (it->second.empty()) opposite.erase(it);
        }
    }

    std::map<double, Level> bids_, asks_;
    std::vector<BookListener*> listeners_;
};
