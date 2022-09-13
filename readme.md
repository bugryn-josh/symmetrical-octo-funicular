TODO:
- [X] - Implement API based functionality -- currently GUI/login based
- [X] - Implement a handler for challenges to multiple users
- [ ] - Implement Passcode option with input
- [ ] - Implement timed await with Passcode option
- [ ] - Implement potentially better session handling ?? may not be necessary as an API based program
- [ ] - Test user messages


- Install GPG4Win
- Run `gpg --full-generate-key`, use RSA,RSA and length=4096
- Run `gpg --list-secret-keys --keyid-format=long`
- Copy 'sec' key ID after 'rsa4096/'
- Run `gpg --armor --export [keyID]`
- Copy Public Key Output and add to GitHub account
- Run `git config --global user.signingkey [keyID]`
- Run `git config commit.gpgsign true`
- Run `git config --global gpg.program "c:/Program Files (x86)/GnuPG/bin/gpg.exe"`
- Sign commits!