.PHONY: setup migrate worker test lint format

setup:
	@node -v
	@npm -v
	@npm install

migrate:
	@npm run migrate

worker:
	@npm run worker

test:
	@npm test

lint:
	@npm run lint

format:
	@npm run format
