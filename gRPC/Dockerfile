FROM node
WORKDIR /app

COPY package.json .
RUN npm install --quiet

RUN npm install pm2 -g

COPY . .

RUN mkdir tfjs-model_yamnet_tfjs_1
RUN curl https://storage.googleapis.com/tfhub-tfjs-modules/google/tfjs-model/yamnet/tfjs/1.tar.gz | tar -xz -C ./tfjs-model_yamnet_tfjs_1

EXPOSE 50051-50058
EXPOSE 50061-50068

CMD ["pm2-runtime", "container_ecosystem.config.cjs", "--only", "kromosynth-gRPC"]