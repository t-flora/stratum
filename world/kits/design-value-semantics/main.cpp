// main.cpp: how a client uses the order book today.
#include "order_book.hpp"

#include <cstdio>

struct PositionTracker : BookListener {
    PositionTracker(OrderBook& book, std::string trader) : book(book), trader(std::move(trader)) {
        book.subscribe(this);
    }
    void on_fill(Order& resting, Order& incoming, int qty) override {
        fills.push_back(&resting);
        if (incoming.trader() == trader) position += incoming.side() == Side::Buy ? qty : -qty;
        if (resting.trader() == trader) position += resting.side() == Side::Buy ? qty : -qty;
    }
    void on_change(OrderBook& changed) override {
        std::shared_ptr<Order> top;
        if (changed.best(Side::Sell, top) && top->trader() == trader) ++times_at_top;
    }
    OrderBook& book;
    std::string trader;
    std::vector<Order*> fills;
    int position = 0;
    int times_at_top = 0;
};

int main() {
    OrderBook book;
    PositionTracker alice(book, "alice");

    auto a1 = book.submit(Side::Sell, 101.0, 50, "alice");
    auto a2 = book.submit(Side::Sell, 102.0, 30, "alice");
    book.submit(Side::Buy, 99.5, 40, "bob");
    book.submit(Side::Buy, 101.0, 20, "carol");

    a2->qty() = 10;
    book.levels(Side::Sell)[102.0].front()->price() = 101.5;

    std::shared_ptr<Order> bid, ask;
    if (book.best(Side::Buy, bid) && book.best(Side::Sell, ask))
        std::printf("best bid %.2f x %d, best ask %.2f x %d\n", bid->price(), bid->qty(),
                    ask->price(), ask->qty());

    book.cancel(a1);
    std::printf("alice: position %d, fills %zu, at top %d times, a1 in book: %s, a2 at %.2f\n",
                alice.position, alice.fills.size(), alice.times_at_top,
                a1->book() ? "yes" : "no", a2->price());
}
