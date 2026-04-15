let nextAccountId = 0;

class Account {
  readonly id: number = nextAccountId++;
  private balance = 0;

  getBalance() {
    return this.balance;
  }

  add(amount: number) {
    this.balance += amount;
  }

  remove(amount: number) {
    this.balance -= amount;
  }
}
